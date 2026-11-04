import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { beforeAll, expect, test } from "vitest";
import { readingEvidence } from "../src/lib/layout";
const scope = { self: {} };
runInNewContext(readFileSync("public/photo-analysis.js", "utf8"), scope);
const photo = scope.self.lettraPhoto;
let cv;
beforeAll(async () => { cv = await createRequire(import.meta.url)("@techstark/opencv-js"); }, 30000);
test("projection abstains on blank inputs", () => {
  expect(photo.projectionAngle({ width: 200, height: 100, points: [], glyphs: [] }).accepted).toBe(false);
});
test("line projection finds arbitrary text angles without page borders", () => {
  for (const angle of [-43, -12, 7, 83]) {
    const r = angle * Math.PI / 180, points = [];
    for (let y = -70; y <= 70; y += 14) for (let x = -90; x <= 90; x++) points.push([x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]);
    const result = photo.projectionAngle({ width: 300, height: 300, points, glyphs: Array(100).fill({}) });
    expect(result.accepted).toBe(true);
    expect(Math.abs(result.angle - angle)).toBeLessThanOrEqual(.5);
  }
});
test("expanded rotation retains marks in all four source corners", () => {
  const width = 96, height = 72, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const colors = [[255,0,0],[0,255,0],[0,0,255],[180,0,180]];
  [[0,0],[90,0],[0,66],[90,66]].forEach(([left,top], k) => {
    for(let y=top;y<top+6;y++)for(let x=left;x<left+6;x++)data.set([...colors[k],255],(y*width+x)*4);
  });
  for (const angle of [-90,-43,-12,0,7,45,83,180]) {
    const rotated = photo.expandedRotate(cv, { data, width, height }, angle);
    for(const color of colors){let count=0;for(let i=0;i<rotated.data.length;i+=4)if(color.every((c,k)=>Math.abs(rotated.data[i+k]-c)<30))count++;expect(count).toBeGreaterThan(10);}
  }
});
test("reading evidence favors complete confident text over fragments or noise", () => {
  const complete = [{text:"A complete paragraph with several readable words",confidence:85}];
  expect(readingEvidence(complete)).toBeGreaterThan(readingEvidence([{text:"A",confidence:99}]));
  expect(readingEvidence(complete)).toBeGreaterThan(readingEvidence([{text:"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",confidence:35}]));
  expect(readingEvidence([{text:"|~!-----",confidence:99}])).toBe(0);
});
