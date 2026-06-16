// world.js — scene, renderer, lighting, fog, and the winding "Spiral Bastion" road.
import * as THREE from "three";
import { disposeGroup } from "./dispose.js";

const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.halfWidth = 6.2; // half road width (playable lateral range)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = false;

    const SKY = 0xaec6df;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 60, 200);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.5, 1200);
    this.camera.position.set(0, 20, -20);

    // ---- lights ----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7b8c, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.05);
    sun.position.set(40, 80, 30);
    this.scene.add(sun);

    // ---- a faint cloud floor far below for depth ----
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(400, 48),
      new THREE.MeshBasicMaterial({ color: 0xcdddec, transparent: true, opacity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -34;
    this.scene.add(floor);

    // reusable temporaries (no per-frame allocation)
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._r = new THREE.Vector3();

    this.curve = null;
    this.length = 1;
    this.roadGroup = new THREE.Group();
    this.scene.add(this.roadGroup);

    this.resize();
  }

  // Build a conical-helix road (spirals upward and inward, like the reference image).
  buildPath(level = 1) {
    // dispose previous road meshes (frees GPU memory, then detaches)
    disposeGroup(this.roadGroup);

    const turns = 2.6 + level * 0.18;       // more loops at higher levels
    const heightTotal = 64 + level * 6;
    const rOuter = 62;
    const rInner = 16;
    const phase = 0.6;
    const N = 46;

    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const ease = t; // linear climb reads cleanest with the chase cam
      const angle = phase + t * turns * Math.PI * 2;
      const r = THREE.MathUtils.lerp(rOuter, rInner, t);
      pts.push(new THREE.Vector3(Math.cos(angle) * r, ease * heightTotal, Math.sin(angle) * r));
    }

    this.curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
    this.curve.arcLengthDivisions = 1400;
    this.length = this.curve.getLength();

    this._buildRoadMesh();
    return this.curve;
  }

  _buildRoadMesh() {
    const M = 900;                 // road samples along length
    const hw = this.halfWidth;
    const wallH = 2.6;

    const roadPos = [];
    const roadCol = [];
    const wallLPos = [], wallRPos = [];
    const colRoadA = new THREE.Color(0xe9dcc0);
    const colRoadB = new THREE.Color(0xddcfac);
    const tan = new THREE.Vector3();
    const right = new THREE.Vector3();
    const c = new THREE.Vector3();

    const lEdge = [], rEdge = [];
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      this.curve.getPointAt(u, c);
      this.curve.getTangentAt(u, tan);
      right.copy(UP).cross(tan).normalize();
      lEdge.push(c.clone().addScaledVector(right, hw));
      rEdge.push(c.clone().addScaledVector(right, -hw));
    }

    // road as triangle strip (two triangles per segment)
    for (let i = 0; i < M; i++) {
      const l0 = lEdge[i], r0 = rEdge[i], l1 = lEdge[i + 1], r1 = rEdge[i + 1];
      roadPos.push(l0.x, l0.y, l0.z, r0.x, r0.y, r0.z, l1.x, l1.y, l1.z);
      roadPos.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, l1.x, l1.y, l1.z);
      const col = (i % 2 === 0) ? colRoadA : colRoadB;
      for (let k = 0; k < 6; k++) roadCol.push(col.r, col.g, col.b);

      // walls (vertical quads) on both edges
      pushWallQuad(wallLPos, l0, l1, wallH);
      pushWallQuad(wallRPos, r0, r1, wallH);
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(roadPos, 3));
    roadGeo.setAttribute("color", new THREE.Float32BufferAttribute(roadCol, 3));
    roadGeo.computeVertexNormals();
    const road = new THREE.Mesh(
      roadGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    this.roadGroup.add(road);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a, side: THREE.DoubleSide });
    for (const wp of [wallLPos, wallRPos]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
      g.computeVertexNormals();
      this.roadGroup.add(new THREE.Mesh(g, wallMat));
    }
  }

  // Fill out vectors with the road frame at arc-length u (0..1).
  frameAt(u, outPos, outTangent, outRight) {
    u = THREE.MathUtils.clamp(u, 0, 1);
    this.curve.getPointAt(u, outPos);
    this.curve.getTangentAt(u, outTangent).normalize();
    outRight.copy(UP).cross(outTangent).normalize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // re-apply pixel ratio so the backing store stays correct across DPR changes
    // (e.g. dragging the window between HiDPI and standard monitors)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function pushWallQuad(arr, e0, e1, h) {
  // quad: e0(bottom), e1(bottom), e1+up, e0+up  -> two triangles
  const a = e0, b = e1;
  arr.push(a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + h, b.z);
  arr.push(a.x, a.y, a.z, b.x, b.y + h, b.z, a.x, a.y + h, a.z);
}
