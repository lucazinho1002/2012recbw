let scene, camera, renderer, world;
let blocks = [];
let selectedBlock = null;
let currentMode = "build";
let isPlaying = false;
let leftSidePressed = false;
let rightSidePressed = false;
let isDraggingBlock = false;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
let dragOffset = new THREE.Vector3();
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

class Block {
  constructor(type, x, y, z, color = 0xe62e2e) {
    this.type = type;
    this.color = color;
    this.isRocket = type === "rocket";
    this.isProgrammed = false;
    this.initialPos = new THREE.Vector3(x, y, z);
    this.initialQuat = new THREE.Quaternion();

    let geo;
    const matOpts = { color: color, roughness: 0.35, metalness: 0.1 };

    if (type === "cube") {
      geo = new THREE.BoxGeometry(1, 1, 1);
    } else if (type === "wedge") {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, -0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(-0.5, 0.5);
      shape.closePath();
      geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      geo.center();
    } else if (type === "rocket") {
      geo = new THREE.CylinderGeometry(0.26, 0.38, 1.2, 18);
      matOpts.color = 0xe0e0e0;
      matOpts.metalness = 0.7;
    } else if (type === "wheel") {
      geo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 20);
      geo.rotateZ(Math.PI / 2);
      matOpts.color = 0x222222;
    } else if (type === "jump") {
      const rampShape = new THREE.Shape();
      rampShape.moveTo(-1.5, -0.45);
      rampShape.lineTo(1.5, -0.45);
      rampShape.lineTo(1.5, 0.55);
      rampShape.closePath();
      geo = new THREE.ExtrudeGeometry(rampShape, { depth: 2.4, bevelEnabled: false });
      geo.center();
      geo.rotateY(Math.PI / 2);
      matOpts.color = 0xff8c1a;
    } else {
      geo = new THREE.BoxGeometry(0.7, 1.3, 0.5);
      matOpts.color = type === "alien" ? 0x33cc33 : 0x2d6cdf;
    }

    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matOpts));
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // Rocket flame visual mesh (visible when firing in play mode)
    if (this.isRocket) {
      const flameGeo = new THREE.ConeGeometry(0.24, 0.8, 12);
      flameGeo.rotateX(Math.PI);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      this.flameMesh = new THREE.Mesh(flameGeo, flameMat);
      this.flameMesh.position.set(0, -0.85, 0);
      this.flameMesh.visible = false;
      this.mesh.add(this.flameMesh);
    }

    this.body = new CANNON.Body({
      mass: type === "jump" ? 0 : 1,
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(x, y, z)
    });
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    world.addBody(this.body);

    blocks.push(this);
    selectBlock(this);
  }

  setColor(hex) {
    this.color = hex;
    this.mesh.material.color.set(hex);
  }

  syncTransformToBody() {
    this.initialPos.copy(this.mesh.position);
    this.initialQuat.copy(this.mesh.quaternion);
    this.body.position.set(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);
    this.body.quaternion.set(
      this.mesh.quaternion.x,
      this.mesh.quaternion.y,
      this.mesh.quaternion.z,
      this.mesh.quaternion.w
    );
  }

  remove() {
    scene.remove(this.mesh);
    world.remove(this.body);
    blocks = blocks.filter((b) => b !== this);
    if (selectedBlock === this) deselectBlock();
  }
}

function init3D() {
  const container = document.getElementById("canvas-container");
  const settings = JSON.parse(
    localStorage.getItem("bw_settings") || '{"sound":true,"grid":true,"shadows":true}'
  );

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 28, 80);

  camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000);
  camera.position.set(9, 7, 11);
  camera.lookAt(0, 0.5, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = settings.shadows;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.68));

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.78);
  dirLight.position.set(15, 25, 15);
  dirLight.castShadow = settings.shadows;
  scene.add(dirLight);

  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);

  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(groundBody);

  if (settings.grid) {
    const gridHelper = new THREE.GridHelper(40, 40, 0xffffff, 0xd8eed8);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
  }

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x58b847, roughness: 0.85 })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const dom = renderer.domElement;
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);

  const params = new URLSearchParams(window.location.search);
  const worldPreset = params.get("world") || "empty";
  if (worldPreset === "rocket") spawnDemoRocket();
  else if (worldPreset === "car") spawnDemoCar();
  else if (worldPreset === "alien") spawnDemoAlien();

  animate();
}

function onResize() {
  const container = document.getElementById("canvas-container");
  if (!renderer || !camera || !container.clientWidth) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (isPlaying) {
    world.step(1 / 60);

    blocks.forEach((b) => {
      if (b.isRocket) {
        const firing = leftSidePressed && b.isProgrammed;
        if (b.flameMesh) b.flameMesh.visible = firing;
        if (firing) {
          blocks.forEach((other) => {
            if (other.type !== "jump" && other.body.position.distanceTo(b.body.position) < 2.6) {
              other.body.applyForce(new CANNON.Vec3(0, 19, -15), other.body.position);
            }
          });
        }
      }
      if (b.type === "wheel" && (leftSidePressed || rightSidePressed)) {
        blocks.forEach((other) => {
          if (other.type !== "jump" && other.body.position.distanceTo(b.body.position) < 2.8) {
            other.body.applyForce(new CANNON.Vec3(0, 0, -9.5), other.body.position);
          }
        });
      }
      if (b.mesh && b.body) {
        b.mesh.position.copy(b.body.position);
        b.mesh.quaternion.copy(b.body.quaternion);
      }
    });
  } else if (selectedBlock && selectedBlock.mesh) {
    updateGizmoPosition();
  }

  renderer.render(scene, camera);
}

function spawnDemoRocket() {
  clearScene();
  const c = new Block("cube", 0, 0.5, 0, 0xe62e2e);
  c.syncTransformToBody();
  const r = new Block("rocket", 0, 1.5, 0);
  r.isProgrammed = true;
  r.syncTransformToBody();
  deselectBlock();
}

function spawnDemoCar() {
  clearScene();
  new Block("cube", 0, 0.9, 2.5, 0x1e73be).syncTransformToBody();
  new Block("wheel", -0.65, 0.5, 3.0).syncTransformToBody();
  new Block("wheel", 0.65, 0.5, 3.0).syncTransformToBody();
  new Block("wheel", -0.65, 0.5, 2.0).syncTransformToBody();
  new Block("wheel", 0.65, 0.5, 2.0).syncTransformToBody();
  new Block("dude", 0, 1.9, 2.5).syncTransformToBody();
  new Block("jump", 0, 0.5, -3.5).syncTransformToBody();
  deselectBlock();
}

function spawnDemoAlien() {
  clearScene();
  new Block("alien", -0.8, 1.15, 0).syncTransformToBody();
  new Block("dude", 0.8, 1.15, 0).syncTransformToBody();
  new Block("wedge", 0, 0.5, -1.5, 0xffcc00).syncTransformToBody();
  deselectBlock();
}

function clearScene() {
  blocks.forEach((b) => {
    scene.remove(b.mesh);
    world.remove(b.body);
  });
  blocks = [];
  deselectBlock();
}

function selectBlock(block) {
  if (currentMode === "play") return;
  selectedBlock = block;
  document.getElementById("floating-gizmo").classList.remove("hidden");
  updateGizmoPosition();

  if (block.isRocket) {
    document.getElementById("programming-panel").classList.remove("hidden");
    updateProgrammingPanel(block);
  } else {
    document.getElementById("programming-panel").classList.add("hidden");
  }
}

function deselectBlock() {
  selectedBlock = null;
  document.getElementById("floating-gizmo").classList.add("hidden");
  document.getElementById("programming-panel").classList.add("hidden");
}

function updateGizmoPosition() {
  if (!selectedBlock) return;
  const container = document.getElementById("canvas-container");
  const vector = selectedBlock.mesh.position.clone();
  vector.project(camera);
  const x = (vector.x * 0.5 + 0.5) * container.clientWidth;
  const y = (-vector.y * 0.5 + 0.5) * container.clientHeight;

  const gizmo = document.getElementById("floating-gizmo");
  gizmo.style.left = `${x - 40}px`;
  gizmo.style.top = `${y - 62}px`;
}

function updateProgrammingPanel(block) {
  const slot = document.getElementById("slot-event");
  if (block.isProgrammed) {
    slot.textContent = "TAP LEFT";
    slot.classList.add("filled-blue");
  } else {
    slot.textContent = "Tap to assign TAP LEFT";
    slot.classList.remove("filled-blue");
  }
}

function getNormalizedMouse(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onPointerDown(event) {
  if (currentMode === "play") return;
  getNormalizedMouse(event);
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(blocks.map((b) => b.mesh));
  if (intersects.length > 0) {
    const foundBlock = blocks.find((b) => b.mesh === intersects[0].object);
    if (foundBlock) {
      selectBlock(foundBlock);
      isDraggingBlock = true;
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), foundBlock.mesh.position);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersectPoint);
      dragOffset.copy(foundBlock.mesh.position).sub(intersectPoint);
    }
  } else {
    deselectBlock();
  }
}

function onPointerMove(event) {
  if (!isDraggingBlock || !selectedBlock || currentMode === "play") return;
  getNormalizedMouse(event);
  raycaster.setFromCamera(mouse, camera);

  const intersectPoint = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
    const target = intersectPoint.add(dragOffset);
    selectedBlock.mesh.position.x = Math.round(target.x * 2) / 2;
    selectedBlock.mesh.position.z = Math.round(target.z * 2) / 2;
    selectedBlock.syncTransformToBody();
    updateGizmoPosition();
  }
}

function onPointerUp() {
  isDraggingBlock = false;
}

function startSimulation() {
  currentMode = "play";
  isPlaying = true;
  deselectBlock();
  const playBtn = document.getElementById("btn-play");
  playBtn.textContent = "■";
  playBtn.classList.add("playing");
  document.getElementById("play-controls").classList.remove("hidden");
  document.getElementById("sidebar").classList.add("closed");
  document.getElementById("editor-topbar").classList.add("expanded");

  blocks.forEach((b) => {
    b.syncTransformToBody();
    if (b.body.mass > 0) {
      b.body.type = CANNON.Body.DYNAMIC;
      b.body.wakeUp();
    }
  });
}

function stopSimulation() {
  currentMode = "build";
  isPlaying = false;
  leftSidePressed = false;
  rightSidePressed = false;
  const playBtn = document.getElementById("btn-play");
  playBtn.textContent = "▶";
  playBtn.classList.remove("playing");
  document.getElementById("play-controls").classList.add("hidden");
  document.getElementById("sidebar").classList.remove("closed");
  document.getElementById("editor-topbar").classList.remove("expanded");

  blocks.forEach((b) => {
    if (b.flameMesh) b.flameMesh.visible = false;
    b.body.velocity.set(0, 0, 0);
    b.body.angularVelocity.set(0, 0, 0);
    b.body.type = CANNON.Body.STATIC;
    b.mesh.position.copy(b.initialPos);
    b.mesh.quaternion.copy(b.initialQuat);
    b.syncTransformToBody();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init3D();

  document.getElementById("btn-play").addEventListener("click", () => {
    if (currentMode === "build") startSimulation();
    else stopSimulation();
  });

  document.getElementById("btn-toggle-sidebar").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("closed");
    document.getElementById("editor-topbar").classList.toggle("expanded");
  });

  document.querySelectorAll("[data-block]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentMode !== "build") return;
      const type = btn.getAttribute("data-block");
      const yPos = type === "dude" || type === "alien" ? 1.15 : 0.5;
      const offset = (blocks.length % 4) * 0.6;
      const b = new Block(type, offset, yPos, 0);
      b.syncTransformToBody();
    });
  });

  document.querySelectorAll("[data-color]").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      if (!selectedBlock) return;
      selectedBlock.setColor(swatch.getAttribute("data-color"));
    });
  });

  document.querySelectorAll("[data-texture]").forEach((tex) => {
    tex.addEventListener("click", () => {
      if (!selectedBlock) return;
      const name = tex.getAttribute("data-texture");
      if (name === "metal") {
        selectedBlock.setColor(0xb8b8b8);
        selectedBlock.mesh.material.metalness = 0.8;
        selectedBlock.mesh.material.roughness = 0.2;
      } else if (name === "wood") {
        selectedBlock.setColor(0xb5651d);
        selectedBlock.mesh.material.metalness = 0.05;
        selectedBlock.mesh.material.roughness = 0.85;
      } else if (name === "brick") {
        selectedBlock.setColor(0xa52a2a);
        selectedBlock.mesh.material.metalness = 0.05;
        selectedBlock.mesh.material.roughness = 0.9;
      } else if (name === "carbon") {
        selectedBlock.setColor(0x262626);
        selectedBlock.mesh.material.metalness = 0.5;
        selectedBlock.mesh.material.roughness = 0.35;
      }
    });
  });

  document.querySelectorAll("[data-code]").forEach((tile) => {
    tile.addEventListener("click", () => {
      if (selectedBlock && selectedBlock.isRocket) {
        selectedBlock.isProgrammed = true;
        updateProgrammingPanel(selectedBlock);
      }
    });
  });

  document.getElementById("slot-event").addEventListener("click", () => {
    if (selectedBlock && selectedBlock.isRocket) {
      selectedBlock.isProgrammed = true;
      updateProgrammingPanel(selectedBlock);
    }
  });

  document.getElementById("btn-close-prog").addEventListener("click", () => {
    document.getElementById("programming-panel").classList.add("hidden");
  });

  document.getElementById("btn-rotate").addEventListener("click", () => {
    if (!selectedBlock) return;
    selectedBlock.mesh.rotation.y += Math.PI / 2;
    selectedBlock.syncTransformToBody();
  });

  document.getElementById("btn-delete").addEventListener("click", () => {
    if (selectedBlock) selectedBlock.remove();
  });

  const touchLeft = document.getElementById("touch-left");
  const touchRight = document.getElementById("touch-right");

  touchLeft.addEventListener("pointerdown", () => { leftSidePressed = true; });
  touchLeft.addEventListener("pointerup", () => { leftSidePressed = false; });
  touchLeft.addEventListener("pointerleave", () => { leftSidePressed = false; });

  touchRight.addEventListener("pointerdown", () => { rightSidePressed = true; });
  touchRight.addEventListener("pointerup", () => { rightSidePressed = false; });
  touchRight.addEventListener("pointerleave", () => { rightSidePressed = false; });
});
