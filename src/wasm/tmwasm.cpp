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
#include "tmConditionNodesPaired.h"
#include "tmConditionNodesCollinear.h"
#include "tmConditionEdgeLengthFixed.h"

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
       << ",\"y\":" << v->GetLoc().y
       << ",\"e\":" << v->GetElevation()
       << ",\"d\":" << v->GetDepth() << "}";
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

// Create the conditions described in the spec (after the edges) on the built
// tree, via the same tmTree API the desktop GUI uses. Node/edge indices are
// 0-based spec indices. Each condition is created in a try block so a bad one
// (e.g. referencing a non-leaf node) is skipped rather than aborting the build.
static void applyConditions(tmTree* t, std::vector<tmNode*>& nodes,
                            std::vector<tmEdge*>& edges, istringstream& is) {
  size_t numConds = 0;
  if (!(is >> numConds)) return;
  auto node = [&](int i) -> tmNode* { return (i >= 0 && (size_t)i < nodes.size()) ? nodes[i] : nullptr; };
  auto edge = [&](int i) -> tmEdge* { return (i >= 0 && (size_t)i < edges.size()) ? edges[i] : nullptr; };
  auto nodeList = [](tmNode* n) { tmArray<tmNode*> a; if (n) a.push_back(n); return a; };

  for (size_t i = 0; i < numConds; ++i) {
    std::string tag;
    if (!(is >> tag)) break;
    try {
      if (tag == "CNsn") { int n; is >> n; if (node(n)) { tmArray<tmNode*> a = nodeList(node(n)); t->SetNodesFixedToSymmetryLinev4(a); } }
      else if (tag == "CNen") { int n; is >> n; if (node(n)) { tmArray<tmNode*> a = nodeList(node(n)); t->SetNodesFixedToPaperEdgev4(a); } }
      else if (tag == "CNkn") { int n; is >> n; if (node(n)) { tmArray<tmNode*> a = nodeList(node(n)); t->SetNodesFixedToPaperCornerv4(a); } }
      else if (tag == "CNfn") { int n, xf, yf; double xv, yv; is >> n >> xf >> yf >> xv >> yv; if (node(n)) { tmArray<tmNode*> a = nodeList(node(n)); t->SetNodesFixedToPositionv4(a, xf != 0, xv, yf != 0, yv); } }
      else if (tag == "CNpn") { int a, b; is >> a >> b; if (node(a) && node(b)) t->GetOrMakeTwoPartCondition<tmConditionNodesPaired, tmNode>(node(a), node(b)); }
      else if (tag == "CNcn") { int a, b, c; is >> a >> b >> c; if (node(a) && node(b) && node(c)) t->GetOrMakeThreePartCondition<tmConditionNodesCollinear, tmNode>(node(a), node(b), node(c)); }
      else if (tag == "CNfe") { int e; is >> e; if (edge(e)) t->GetOrMakeOnePartCondition<tmConditionEdgeLengthFixed, tmEdge>(edge(e)); }
      else if (tag == "CNes") { int a, b; is >> a >> b; if (edge(a) && edge(b)) { tmArray<tmEdge*> ea; ea.push_back(edge(a)); ea.push_back(edge(b)); t->SetEdgesSameStrain(ea); } }
      else if (tag == "CNap") { int a, b; is >> a >> b; tmPath* p = (node(a) && node(b)) ? t->GetLeafPath(node(a), node(b)) : nullptr; if (p) { tmArray<tmPath*> pa; pa.push_back(p); t->SetPathsActivev4(pa); } }
      else if (tag == "CNfp") { int a, b; double ang; is >> a >> b >> ang; tmPath* p = (node(a) && node(b)) ? t->GetLeafPath(node(a), node(b)) : nullptr; if (p) { tmArray<tmPath*> pa; pa.push_back(p); t->SetPathsAngleFixedv4(pa, ang); } }
      else if (tag == "CNqp") { int a, b; size_t q; double off; is >> a >> b >> q >> off; tmPath* p = (node(a) && node(b)) ? t->GetLeafPath(node(a), node(b)) : nullptr; if (p) { tmArray<tmPath*> pa; pa.push_back(p); t->SetPathsAngleQuantv4(pa, q, off); } }
      else { std::string rest; std::getline(is, rest); } // unknown tag: skip line
    } catch (...) { /* skip a malformed/invalid condition */ }
  }
}

// Build a tree from authoritative data (node positions + edge topology +
// conditions), using the C++ AddNode/condition API so all derived structure
// (paths, mLeafPaths, polys) is maintained natively — then optimize and build
// the crease pattern. This avoids serializing the cross-linked derived data.
//
// Spec is whitespace-delimited:
//   paperW paperH scale hasSym symX symY symAngle
//   numNodes
//   x y               (numNodes lines; node index = line order, 0-based)
//   numEdges
//   from to length strain stiffness   (numEdges lines; from/to are node indices)
//   numConditions
//   <tag> <fields…>                   (per applyConditions)
// Build a tmTree from a spec stream (header, nodes, edges, conditions) via the
// native AddNode/condition API. `tmNodes` is filled in spec order so callers can
// map results back. The tree is NOT optimized.
static tmTree* buildTreeFromSpec(istringstream& is, std::vector<tmNode*>& tmNodes) {
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

  tmNodes.assign(numNodes, nullptr);
  std::vector<tmEdge*> tmEdges(numEdges, nullptr);
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
        tmEdges[ei] = ne;
        if (ne) { ne->SetLength(e.len); ne->SetStrain(e.strain); ne->SetStiffness(e.stiff); }
        queue.push_back(other);
      }
    }
  }
  t->SetScale(scale);
  applyConditions(t, tmNodes, tmEdges, is);
  return t;
}

extern "C" char* tmSpecBuildCP(const char* spec, int mode) {
  ensureInit();
  istringstream is(spec);
  std::vector<tmNode*> tmNodes;
  tmTree* t = buildTreeFromSpec(is, tmNodes);
  const size_t numNodes = tmNodes.size();

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

// Build a tree from a spec, optimize, build the crease pattern, and return the
// document serialized in TreeMaker 5.0 format (PutSelf). Useful for round-trip
// testing of the v5 reader and as the basis for legacy export.
extern "C" char* tmExportV5(const char* spec, int mode) {
  ensureInit();
  istringstream is(spec);
  std::vector<tmNode*> tmNodes;
  tmTree* t = buildTreeFromSpec(is, tmNodes);
  try { runOptimize(t, mode); t->BuildPolysAndCreasePattern(); } catch (...) { /* still serialize */ }
  ostringstream os;
  t->PutSelf(os);
  char* r = dupString(os.str());
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
