// IO facade. Native format is JSON; legacy TreeMaker .tm/.tmd5 is import-only
// in P1 (v4.0), with v5/v3 and legacy export tracked as follow-ups.
export { treeToJson, treeFromJson } from './json';
export { importLegacy, parseLegacy, looksLikeLegacy, UnsupportedVersionError } from './legacy';
