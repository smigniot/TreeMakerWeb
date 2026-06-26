// Native crease-pattern tester: for each fixture, read it, scale-optimize, then
// BuildPolysAndCreasePattern, and print the CPStatus + part counts. Ground truth
// for the Wasm crease-pattern path. Built/run by cptest.sh.

#include <iostream>
#include <fstream>
#include <string>
#include "tmModel.h"
#include "tmNLCO.h"
#include "tmNLCO_alm.h"
#include "tmScaleOptimizer.h"

using namespace std;

static void run(const string& dir, const string& name) {
  cout << "=== " << name << " ===" << endl;
  tmTree* t = new tmTree();
  ifstream fin((dir + name).c_str());
  if (!fin.good()) { cout << "  cannot open" << endl; return; }
  try { t->GetSelf(fin); } catch (...) { cout << "  read failed" << endl; delete t; return; }

  try {
    tmNLCO_alm* nlco = new tmNLCO_alm();
    tmScaleOptimizer* opt = new tmScaleOptimizer(t, nlco);
    opt->Initialize();
    opt->Optimize();
    delete opt;
    delete nlco;
  } catch (...) { cout << "  optimize threw" << endl; }
  cout << "  scale=" << t->GetScale() << " feasible=" << t->IsFeasible() << endl;

  try {
    t->BuildPolysAndCreasePattern();
  } catch (...) { cout << "  build threw" << endl; }

  tmArray<tmEdge*> be; tmArray<tmPoly*> bp; tmArray<tmVertex*> bv;
  tmArray<tmCrease*> bc; tmArray<tmFacet*> bf;
  int status = (int)t->GetCPStatus(be, bp, bv, bc, bf);
  cout << "  CPStatus=" << status
       << " polys=" << t->GetPolys().size()
       << " verts=" << t->GetVertices().size()
       << " creases=" << t->GetCreases().size()
       << " facets=" << t->GetFacets().size() << endl;
  delete t;
}

int main() {
  tmPart::InitTypes();
  const string dir = "./";
  run(dir, "tmModelTester_1.tmd5");
  run(dir, "tmModelTester_2.tmd5");
  run(dir, "tmModelTester_3.tmd5");
  run(dir, "tmModelTester_4.tmd5");
  run(dir, "tmModelTester_5.tmd5");
  return 0;
}
