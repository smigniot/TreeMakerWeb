import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Tree } from '../model/tree';
import { pt } from '../model/geometry';
import { treeToJson, treeFromJson } from './json';
import { importLegacy, parseLegacy, UnsupportedVersionError } from './legacy';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, '../../Orig/Source/test/tmModelTester', name), 'latin1');

describe('native JSON IO', () => {
  it('round-trips a tree through JSON', () => {
    const t = new Tree();
    t.setScale(0.2);
    t.setSymmetry({ has: true, loc: pt(0.5, 0.5), angle: 45 });
    const a = t.addNode(pt(0.1, 0.2));
    const { node: b } = t.addNodeFrom(a.id, pt(0.8, 0.7));
    t.setNodeLabel(b.id, 'tip');
    t.addCondition({ type: 'NodeOnEdge', tag: 'CNen', node: a.id });

    const json = treeToJson(t);
    const t2 = treeFromJson(json);
    expect(t2.toState()).toEqual(t.toState());
    // derived state is rebuilt
    expect(t2.pathList()).toHaveLength(1);
  });

  it('rejects malformed/unsupported JSON', () => {
    expect(() => treeFromJson('{"format":99}')).toThrow();
    expect(() => treeFromJson('not json')).toThrow();
  });
});

describe('legacy v4 import', () => {
  it('imports the 3-star fixture (file_1)', () => {
    const t = importLegacy(fixture('tmModelTester_1.tmd5'));
    expect(t.nodes.size).toBe(4);
    expect(t.edges.size).toBe(3);
    expect(t.conditionList()).toHaveLength(0);
    // 3 leaf nodes around 1 center → C(3,2) = 3 leaf paths
    expect(t.pathList()).toHaveLength(3);
    expect(t.symmetry.has).toBe(false);
  });

  it('imports the symmetric centipede (file_3) with conditions', () => {
    const t = importLegacy(fixture('tmModelTester_3.tmd5'));
    expect(t.nodes.size).toBe(33);
    expect(t.edges.size).toBe(32);
    expect(t.symmetry.has).toBe(true);
    const conds = t.conditionList();
    expect(conds).toHaveLength(12);
    expect(conds.filter((c) => c.type === 'NodesPaired')).toHaveLength(11);
    expect(conds.filter((c) => c.type === 'NodeSymmetric')).toHaveLength(1);
  });

  it('imports the scorpion (file_5) with edge + path conditions', () => {
    const t = importLegacy(fixture('tmModelTester_5.tmd5'));
    const conds = t.conditionList();
    // 10 CNap + 2 CNen + 14 CNes + 2 CNkn + 6 CNpn + 2 CNsn = 36
    expect(conds).toHaveLength(36);
    expect(conds.filter((c) => c.type === 'EdgesSameStrain')).toHaveLength(14);
    expect(conds.filter((c) => c.type === 'PathActive')).toHaveLength(10);
    // edge-referencing conditions point at real edges
    const same = conds.find((c) => c.type === 'EdgesSameStrain');
    expect(same && t.getEdge((same as { edge1: number }).edge1)).toBeTruthy();
  });

  it('legacy import survives a JSON round-trip (idempotent state)', () => {
    const t = importLegacy(fixture('tmModelTester_3.tmd5'));
    const t2 = treeFromJson(treeToJson(t));
    expect(t2.toState()).toEqual(t.toState());
  });

  it('throws an actionable error on unsupported versions', () => {
    const v5 = 'tree\n5.0\n1\n1\n0.1\nfalse\n0\n0\n0\n0\n0\n0\n0\n0\n0\n0\n0';
    expect(() => parseLegacy(v5)).toThrow(UnsupportedVersionError);
  });
});
