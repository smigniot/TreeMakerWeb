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
