// C wrapper exposing the TreeMaker optimizer to JavaScript via WebAssembly.
//
// tmOptimize(docText, mode): reads a TreeMaker document (v4/v5 text — the same
// format the desktop app reads), runs one optimization pass with the ALM
// backend, and returns a compact JSON string with the resulting scale, per-node
// positions, per-edge strains, and feasibility. The caller frees the returned
// pointer. Mirrors the optimizer invocation in tmModelTester.cpp.
//
//   mode 0 = scale  (tmScaleOptimizer — circle/river packing, maximize scale)
//   mode 1 = edge   (tmEdgeOptimizer  — uniform edge-strain maximization)
//   mode 2 = strain (tmStrainOptimizer — minimize stiffness-weighted strain)

#include <sstream>
#include <string>
#include <cstring>
#include <cstdlib>
#include <vector>

#include "tmModel.h"
#include "tmNLCO.h"
#include "tmNLCO_alm.h"
#include "tmScaleOptimizer.h"
#include "tmEdgeOptimizer.h"
#include "tmStrainOptimizer.h"

using namespace std;

static bool gInit = false;
static void ensureInit() {
  if (!gInit) { tmPart::InitTypes(); gInit = true; }
}

static char* dupString(const string& s) {
  char* out = static_cast<char*>(malloc(s.size() + 1));
  memcpy(out, s.c_str(), s.size() + 1);
  return out;
}

static char* makeResult(tmTree* t, bool ok, const char* err) {
  ostringstream os;
  os.setf(os.fixed, os.floatfield);
  os.precision(10);
  os << "{\"ok\":" << (ok ? "true" : "false");
  if (err) os << ",\"error\":\"" << err << "\"";
  os << ",\"scale\":" << t->GetScale();
  os << ",\"feasible\":" << (t->IsFeasible() ? "true" : "false");

  os << ",\"nodes\":[";
  const tmDpptrArray<tmNode>& nodes = t->GetNodes();
  for (size_t i = 0; i < nodes.size(); ++i) {
    if (i) os << ",";
    tmNode* n = nodes[i];
    os << "{\"i\":" << n->GetIndex()
       << ",\"x\":" << n->GetLocX()
       << ",\"y\":" << n->GetLocY() << "}";
  }
  os << "],\"edges\":[";
  const tmDpptrArray<tmEdge>& edges = t->GetEdges();
  for (size_t i = 0; i < edges.size(); ++i) {
    if (i) os << ",";
    tmEdge* e = edges[i];
    os << "{\"i\":" << e->GetIndex()
       << ",\"strain\":" << e->GetStrain()
       << ",\"stiffness\":" << e->GetStiffness() << "}";
  }
  os << "]}";
  return dupString(os.str());
}

extern "C" char* tmOptimize(const char* docText, int mode) {
  ensureInit();
  tmTree* t = new tmTree();
  try {
    istringstream is(docText);
    t->GetSelf(is);
  } catch (...) {
    char* r = dupString("{\"ok\":false,\"error\":\"read failed\"}");
    delete t;
    return r;
  }

  const char* err = nullptr;
  try {
    tmNLCO_alm* nlco = new tmNLCO_alm();
    if (mode == 0) {
      tmScaleOptimizer* opt = new tmScaleOptimizer(t, nlco);
      opt->Initialize();
      opt->Optimize();
      delete opt;
    } else if (mode == 1) {
      tmEdgeOptimizer* opt = new tmEdgeOptimizer(t, nlco);
      tmDpptrArray<tmNode> movingNodes = t->GetOwnedNodes();
      tmDpptrArray<tmEdge> stretchyEdges = t->GetOwnedEdges();
      opt->Initialize(movingNodes, stretchyEdges);
      opt->Optimize();
      delete opt;
    } else {
      tmStrainOptimizer* opt = new tmStrainOptimizer(t, nlco);
      tmDpptrArray<tmNode> movingNodes = t->GetOwnedNodes();
      tmDpptrArray<tmEdge> stretchyEdges = t->GetOwnedEdges();
      opt->Initialize(movingNodes, stretchyEdges);
      opt->Optimize();
      delete opt;
    }
    delete nlco;
  } catch (tmNLCO::EX_BAD_CONVERGENCE&) {
    err = "bad convergence";
  } catch (tmScaleOptimizer::EX_BAD_SCALE&) {
    err = "scale too small";
  } catch (tmEdgeOptimizer::EX_NO_MOVING_NODES&) {
    err = "no moving nodes";
  } catch (tmEdgeOptimizer::EX_NO_MOVING_EDGES&) {
    err = "no moving edges";
  } catch (tmStrainOptimizer::EX_NO_MOVING_NODES_OR_EDGES&) {
    err = "no moving nodes or edges";
  } catch (...) {
    err = "optimize failed";
  }

  char* r = makeResult(t, err == nullptr, err);
  delete t;
  return r;
}

// Serialize the crease pattern (vertices/creases/facets/status) of a tree `t`
// whose CP has already been built. `extra` is appended inside the object.
static char* serializeCP(tmTree* t, const char* err, const string& extra) {
  tmArray<tmEdge*> be;
  tmArray<tmPoly*> bp;
  tmArray<tmVertex*> bv;
  tmArray<tmCrease*> bc;
  tmArray<tmFacet*> bf;
  int status = err ? -1 : static_cast<int>(t->GetCPStatus(be, bp, bv, bc, bf));

  ostringstream os;
  os.setf(os.fixed, os.floatfield);
  os.precision(10);
  os << "{\"ok\":" << (err ? "false" : "true");
  if (err) os << ",\"error\":\"" << err << "\"";
  os << ",\"status\":" << status;
  if (!extra.empty()) os << "," << extra;

  os << ",\"vertices\":[";
  const tmDpptrArray<tmVertex>& verts = t->GetVertices();
  for (size_t i = 0; i < verts.size(); ++i) {
    if (i) os << ",";
    tmVertex* v = verts[i];
    os << "{\"i\":" << v->GetIndex()
       << ",\"x\":" << v->GetLoc().x
       << ",\"y\":" << v->GetLoc().y << "}";
  }

  os << "],\"creases\":[";
  const tmDpptrArray<tmCrease>& creases = t->GetCreases();
  for (size_t i = 0; i < creases.size(); ++i) {
    if (i) os << ",";
    tmCrease* c = creases[i];
    const tmDpptrArray<tmVertex>& cv = c->GetVertices();
    os << "{\"i\":" << c->GetIndex()
       << ",\"a\":" << (cv.size() > 0 ? cv[0]->GetIndex() : 0)
       << ",\"b\":" << (cv.size() > 1 ? cv[1]->GetIndex() : 0)
       << ",\"k\":" << static_cast<int>(c->GetKind())
       << ",\"f\":" << static_cast<int>(c->GetFold()) << "}";
  }

  os << "],\"facets\":[";
  const tmDpptrArray<tmFacet>& facets = t->GetFacets();
  for (size_t i = 0; i < facets.size(); ++i) {
    if (i) os << ",";
    tmFacet* fc = facets[i];
    os << "{\"i\":" << fc->GetIndex() << ",\"o\":" << fc->GetOrder() << ",\"vs\":[";
    const tmArray<tmVertex*>& fv = fc->GetVertices();
    for (size_t j = 0; j < fv.size(); ++j) {
      if (j) os << ",";
      os << fv[j]->GetIndex();
    }
    os << "]}";
  }
  os << "]}";
  return dupString(os.str());
}

// Build the crease pattern from a tree that is ALREADY scale-optimized.
// "status" is the CPStatus enum (0 = HAS_FULL_CP, otherwise the failure stage).
extern "C" char* tmBuildCreasePattern(const char* docText) {
  ensureInit();
  tmTree* t = new tmTree();
  try {
    istringstream is(docText);
    t->GetSelf(is);
  } catch (...) {
    delete t;
    return dupString("{\"ok\":false,\"error\":\"read failed\"}");
  }
  const char* err = nullptr;
  try { t->BuildPolysAndCreasePattern(); } catch (...) { err = "build failed"; }
  char* r = serializeCP(t, err, "");
  delete t;
  return r;
}

// Run an optimization pass on a tree (shared by the spec and doc entry points).
static const char* runOptimize(tmTree* t, int mode) {
  try {
    tmNLCO_alm* nlco = new tmNLCO_alm();
    if (mode == 1) {
      tmEdgeOptimizer* opt = new tmEdgeOptimizer(t, nlco);
      tmDpptrArray<tmNode> mn = t->GetOwnedNodes();
      tmDpptrArray<tmEdge> se = t->GetOwnedEdges();
      opt->Initialize(mn, se); opt->Optimize(); delete opt;
    } else if (mode == 2) {
      tmStrainOptimizer* opt = new tmStrainOptimizer(t, nlco);
      tmDpptrArray<tmNode> mn = t->GetOwnedNodes();
      tmDpptrArray<tmEdge> se = t->GetOwnedEdges();
      opt->Initialize(mn, se); opt->Optimize(); delete opt;
    } else {
      tmScaleOptimizer* opt = new tmScaleOptimizer(t, nlco);
      opt->Initialize(); opt->Optimize(); delete opt;
    }
    delete nlco;
  } catch (...) {
    return "optimize failed";
  }
  return nullptr;
}

static char* serializeCPWithNodes(tmTree* t, const char* err) {
  ostringstream extra;
  extra.setf(extra.fixed, extra.floatfield);
  extra.precision(10);
  extra << "\"scale\":" << t->GetScale() << ",\"feasible\":" << (t->IsFeasible() ? "true" : "false");
  extra << ",\"nodes\":[";
  const tmDpptrArray<tmNode>& nodes = t->GetNodes();
  for (size_t i = 0; i < nodes.size(); ++i) {
    if (i) extra << ",";
    extra << "{\"i\":" << nodes[i]->GetIndex() << ",\"x\":" << nodes[i]->GetLocX()
          << ",\"y\":" << nodes[i]->GetLocY() << "}";
  }
  extra << "]";
  return serializeCP(t, err, extra.str());
}

// Build a tree from authoritative data (node positions + edge topology), using
// the C++ AddNode API so all derived structure (paths, mLeafPaths, polys) is
// maintained natively — then optimize and build the crease pattern. This avoids
// serializing the densely cross-linked derived structure by hand.
//
// Spec is whitespace-delimited:
//   paperW paperH scale hasSym symX symY symAngle
//   numNodes
//   x y               (numNodes lines; node index = line order, 0-based)
//   numEdges
//   from to length strain stiffness   (numEdges lines; from/to are node indices)
// (Conditions are not yet applied — a tracked follow-up.)
extern "C" char* tmSpecBuildCP(const char* spec, int mode) {
  ensureInit();
  istringstream is(spec);

  double pw, ph, scale, symX, symY, symAngle;
  int hasSym;
  is >> pw >> ph >> scale >> hasSym >> symX >> symY >> symAngle;

  size_t numNodes = 0;
  is >> numNodes;
  std::vector<tmPoint> pos(numNodes);
  for (size_t i = 0; i < numNodes; ++i) { double x, y; is >> x >> y; pos[i] = tmPoint(x, y); }

  size_t numEdges = 0;
  is >> numEdges;
  struct E { int from, to; double len, strain, stiff; };
  std::vector<E> edges(numEdges);
  std::vector<std::vector<size_t> > adj(numNodes);
  for (size_t i = 0; i < numEdges; ++i) {
    is >> edges[i].from >> edges[i].to >> edges[i].len >> edges[i].strain >> edges[i].stiff;
    adj[edges[i].from].push_back(i);
    adj[edges[i].to].push_back(i);
  }

  tmTree* t = new tmTree();
  t->SetPaperWidth(pw);
  t->SetPaperHeight(ph);
  if (hasSym) t->SetSymmetry(tmPoint(symX, symY), symAngle);

  // Build the tree by BFS from node 0, adding each child via AddNode(parent).
  std::vector<tmNode*> tmNodes(numNodes, nullptr);
  if (numNodes > 0) {
    tmNode* root; tmEdge* dummy = nullptr;
    t->AddNode(nullptr, pos[0], root, dummy);
    tmNodes[0] = root;
    std::vector<bool> visited(numNodes, false);
    visited[0] = true;
    std::vector<size_t> queue; queue.push_back(0);
    size_t head = 0;
    while (head < queue.size()) {
      size_t cur = queue[head++];
      for (size_t ei : adj[cur]) {
        E& e = edges[ei];
        size_t other = (size_t)(e.from == (int)cur ? e.to : e.from);
        if (visited[other]) continue;
        visited[other] = true;
        tmNode* nn; tmEdge* ne = nullptr;
        t->AddNode(tmNodes[cur], pos[other], nn, ne);
        tmNodes[other] = nn;
        if (ne) { ne->SetLength(e.len); ne->SetStrain(e.strain); ne->SetStiffness(e.stiff); }
        queue.push_back(other);
      }
    }
  }
  t->SetScale(scale);

  const char* err = runOptimize(t, mode);
  if (!err) { try { t->BuildPolysAndCreasePattern(); } catch (...) { err = "build failed"; } }

  // Node positions in SPEC order (so the caller can map results back to its
  // own nodes), plus the resulting scale.
  ostringstream extra;
  extra.setf(extra.fixed, extra.floatfield);
  extra.precision(10);
  extra << "\"scale\":" << t->GetScale() << ",\"feasible\":" << (t->IsFeasible() ? "true" : "false");
  extra << ",\"nodes\":[";
  for (size_t i = 0; i < numNodes; ++i) {
    if (i) extra << ",";
    tmNode* n = tmNodes[i];
    extra << "{\"i\":" << i << ",\"x\":" << (n ? n->GetLocX() : 0.0)
          << ",\"y\":" << (n ? n->GetLocY() : 0.0) << "}";
  }
  extra << "]";

  char* r = serializeCP(t, err, extra.str());
  delete t;
  return r;
}

// Optimize AND build the crease pattern in one pass on a single in-memory tree,
// so the optimizer's exactly-tangent geometry is never round-tripped through the
// (lossy) text serializer — the faithful path used by the app's Build command.
extern "C" char* tmOptimizeAndBuildCP(const char* docText, int mode) {
  ensureInit();
  tmTree* t = new tmTree();
  try {
    istringstream is(docText);
    t->GetSelf(is);
  } catch (...) {
    delete t;
    return dupString("{\"ok\":false,\"error\":\"read failed\"}");
  }

  const char* err = nullptr;
  try {
    tmNLCO_alm* nlco = new tmNLCO_alm();
    if (mode == 1) {
      tmEdgeOptimizer* opt = new tmEdgeOptimizer(t, nlco);
      tmDpptrArray<tmNode> mn = t->GetOwnedNodes();
      tmDpptrArray<tmEdge> se = t->GetOwnedEdges();
      opt->Initialize(mn, se); opt->Optimize(); delete opt;
    } else if (mode == 2) {
      tmStrainOptimizer* opt = new tmStrainOptimizer(t, nlco);
      tmDpptrArray<tmNode> mn = t->GetOwnedNodes();
      tmDpptrArray<tmEdge> se = t->GetOwnedEdges();
      opt->Initialize(mn, se); opt->Optimize(); delete opt;
    } else {
      tmScaleOptimizer* opt = new tmScaleOptimizer(t, nlco);
      opt->Initialize(); opt->Optimize(); delete opt;
    }
    delete nlco;
  } catch (...) {
    err = "optimize failed";
  }

  if (!err) { try { t->BuildPolysAndCreasePattern(); } catch (...) { err = "build failed"; } }

  ostringstream extra;
  extra.setf(extra.fixed, extra.floatfield);
  extra.precision(10);
  extra << "\"scale\":" << t->GetScale() << ",\"feasible\":" << (t->IsFeasible() ? "true" : "false");
  extra << ",\"nodes\":[";
  const tmDpptrArray<tmNode>& nodes = t->GetNodes();
  for (size_t i = 0; i < nodes.size(); ++i) {
    if (i) extra << ",";
    extra << "{\"i\":" << nodes[i]->GetIndex() << ",\"x\":" << nodes[i]->GetLocX()
          << ",\"y\":" << nodes[i]->GetLocY() << "}";
  }
  extra << "]";

  char* r = serializeCP(t, err, extra.str());
  delete t;
  return r;
}
