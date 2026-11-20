let scene, camera, renderer, world;
let blocks = [];
let selectedBlock = null;
let currentMode = "build";
let isPlaying = false;
let leftSidePressed = false;
let isDraggingBlock = false;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragOffset = new THREE.Vector3();
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let currentWorldId = "my_custom_world";
let draggedItemData = null;

function createGreenCheckerTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const size = 64;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#33cc29" : "#24a81b";
      ctx.fillRect(x * size, y * size, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}

function generateProceduralTexture(type) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext("2d");

  if (type === "wood") {
    ctx.fillStyle = "#a0522d"; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#8b4513"; ctx.lineWidth = 6;
    for (let i = 0; i < 15; i++) { ctx.beginPath(); ctx.arc(128, 128, i * 16, 0, Math.PI * 2); ctx.stroke(); }
  } else if (type === "brick") {
    ctx.fillStyle = "#b22222"; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6;
    for (let y = 0; y < 256; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
  } else if (type === "metal") {
    ctx.fillStyle = "#708090"; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#a9a9a9"; ctx.fillRect(15, 15, 226, 226);
  } else if (type === "carbon") {
    ctx.fillStyle = "#1c1c1c"; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#2c2c2c"; ctx.fillRect(8, 8, 115, 115); ctx.fillRect(133, 133, 115, 115);
  } else if (type.startsWith("face_")) {
    ctx.fillStyle = "#f2b89b"; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#222222";
    if (type === "face_dude") {
      ctx.fillRect(70, 90, 35, 35); ctx.fillRect(150, 90, 35, 35);
      ctx.fillRect(90, 160, 76, 18);
    } else if (type === "face_boy") {
      ctx.fillRect(70, 90, 30, 30); ctx.fillRect(156, 90, 30, 30);
      ctx.beginPath(); ctx.ellipse(128, 165, 24, 16, 0, 0, Math.PI * 2); ctx.fill();
    } else if (type === "face_cat") {
      ctx.beginPath(); ctx.moveTo(65, 110); ctx.lineTo(95, 95); ctx.lineTo(95, 125); ctx.fill();
      ctx.beginPath(); ctx.moveTo(191, 110); ctx.lineTo(161, 95); ctx.lineTo(161, 125); ctx.fill();
      ctx.fillRect(100, 160, 56, 14);
    } else if (type === "face_eye") {
      ctx.beginPath(); ctx.arc(128, 128, 60, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
      ctx.beginPath(); ctx.arc(128, 128, 28, 0, Math.PI * 2); ctx.fillStyle = "#222222"; ctx.fill();
      ctx.beginPath(); ctx.arc(142, 114, 9, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
    }
  }
  return new THREE.CanvasTexture(canvas);
}

class Block {
  constructor(type, x, y, z, color = 0xffaa00, texture = null, code = null) {
    this.type = type;
    this.color = color;
    this.texture = texture;
    this.code = code;
    this.isWheel = type === "wheel";
    this.isRocket = type === "rocket";
    this.isProgrammed = !!code;
    this.initialPos = new THREE.Vector3(x, y, z);
    this.initialQuat = new THREE.Quaternion();

    let geo;
    const matOpts = { color: color, roughness: 0.35, metalness: 0.08 };

    if (type === "cube" || type === "block") {
      geo = new THREE.BoxGeometry(1, 1, 1);
    } else if (type === "wedge" || type === "slope") {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, -0.5); shape.lineTo(0.5, -0.5); shape.lineTo(-0.5, 0.5); shape.closePath();
      geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      geo.center();
    } else if (type === "rocket") {
      geo = new THREE.CylinderGeometry(0.26, 0.38, 1.0, 20);
      matOpts.color = 0xd8d8d8; matOpts.metalness = 0.65;
    } else if (type === "wheel") {
      geo = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 24); geo.rotateZ(Math.PI / 2);
      matOpts.color = 0x222222;
    } else if (type === "cylinder") {
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 24);
    } else if (type === "jump") {
      const rampShape = new THREE.Shape();
      rampShape.moveTo(-1.4, -0.35); rampShape.lineTo(1.4, -0.35); rampShape.lineTo(1.4, 0.45); rampShape.closePath();
      geo = new THREE.ExtrudeGeometry(rampShape, { depth: 0.9, bevelEnabled: false });
      geo.center(); geo.rotateY(Math.PI / 2); matOpts.color = 0xffaa00;
    } else {
      geo = new THREE.BoxGeometry(1, 1, 1);
    }

    if (texture) {
      matOpts.map = generateProceduralTexture(texture);
      matOpts.color = 0xffffff;
    }

    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(matOpts));
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    const edges = new THREE.EdgesGeometry(geo);
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 3 }));
    this.outline.visible = false;
    this.mesh.add(this.outline);

    if (this.isRocket) {
      const flameGeo = new THREE.ConeGeometry(0.24, 0.9, 12);
      flameGeo.rotateX(Math.PI);
      this.flameMesh = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
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
    saveCurrentWorld();
  }

  setColor(hex) {
    this.color = hex;
    this.texture = null;
    this.mesh.material.map = null;
    this.mesh.material.color.set(hex);
    this.mesh.material.needsUpdate = true;
    saveCurrentWorld();
  }

  setTexture(textureType) {
    this.texture = textureType;
    const tex = generateProceduralTexture(textureType);
    this.mesh.material.map = tex;
    this.mesh.material.color.set(0xffffff);
    this.mesh.material.needsUpdate = true;
    saveCurrentWorld();
  }

  setProgramCode(codeVal) {
    this.code = codeVal;
    this.isProgrammed = true;
    saveCurrentWorld();
  }

  syncTransformToBody() {
    this.initialPos.copy(this.mesh.position);
    this.initialQuat.copy(this.mesh.quaternion);
    this.body.position.set(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);
    this.body.quaternion.set(this.mesh.quaternion.x, this.mesh.quaternion.y, this.mesh.quaternion.z, this.mesh.quaternion.w);
  }

  remove() {
    scene.remove(this.mesh);
    world.remove(this.body);
    blocks = blocks.filter((b) => b !== this);
    if (selectedBlock === this) deselectBlock();
    saveCurrentWorld();
  }
}

function saveCurrentWorld() {
  const worldData = blocks.map(b => ({
    type: b.type, x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z,
    color: b.color, texture: b.texture, code: b.code
  }));
  localStorage.setItem(`bw_world_${currentWorldId}`, JSON.stringify(worldData));

  let list = JSON.parse(localStorage.getItem("bw_my_worlds") || "[]");
  if (!list.some(w => w.id === currentWorldId)) {
    list.push({ id: currentWorldId, name: `World` });
    localStorage.setItem("bw_my_worlds", JSON.stringify(list));
  }
}

function init3D() {
  const container = document.getElementById("canvas-container");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  currentWorldId = params.get("world") || "my_custom_world";

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2cb5e8);
  scene.fog = new THREE.Fog(0x7be0ff, 18, 52);

  camera = new THREE.PerspectiveCamera(44, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(7.5, 6.2, 8.8);
  camera.lookAt(-0.6, 0.5, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
  dirLight.position.set(12, 22, 14);
  dirLight.castShadow = true;
  scene.add(dirLight);

  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);

  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(groundBody);

  const floorTex = createGreenCheckerTexture();
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  window.addEventListener("resize", () => {
    if (!renderer || !camera || !container.clientWidth) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  const savedData = localStorage.getItem(`bw_world_${currentWorldId}`);
  if (savedData !== null) {
    loadCustomWorld(currentWorldId);
  } else {
    if (currentWorldId === "rocket") spawnDemoRocket();
    else if (currentWorldId === "car") spawnDemoCar();
  }

  setupDragAndDrop();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (isPlaying) {
    world.step(1 / 60);
    blocks.forEach((b) => {
      // Movimento de foguete
      if (b.isRocket) {
        const firing = !b.code || leftSidePressed;
        if (b.flameMesh) b.flameMesh.visible = firing;
        if (firing) {
          blocks.forEach((other) => {
            if (other.body.position.distanceTo(b.body.position) < 1.4) {
              other.body.applyForce(new CANNON.Vec3(0, 18, -10), other.body.position);
            }
          });
        }
      }
      // Movimento de roda programada
      if (b.isWheel && b.code) {
        const rotating = leftSidePressed;
        if (rotating) {
          b.body.angularVelocity.set(0, 0, 10);
        }
      }
      if (b.mesh && b.body) {
        b.mesh.position.copy(b.body.position);
        b.mesh.quaternion.copy(b.body.quaternion);
      }
    });
  } else if (selectedBlock && selectedBlock.mesh) {
    updateOverlayPositions();
  }
  renderer.render(scene, camera);
}

function spawnDemoRocket() {
  clearScene();
  const c = new Block("cube", 0, 0.5, 0, 0xff3b1f, "face_dude");
  c.syncTransformToBody();
  const r = new Block("rocket", 0, 1.5, 0);
  r.setProgramCode("TAP");
  r.syncTransformToBody();
  deselectBlock();
}

function spawnDemoCar() {
  clearScene();
  new Block("cube", 0, 0.85, 2.5, 0xff3b1f).syncTransformToBody();
  const w1 = new Block("wheel", -0.65, 0.5, 3.0); w1.setProgramCode("TAP"); w1.syncTransformToBody();
  const w2 = new Block("wheel", 0.65, 0.5, 3.0); w2.setProgramCode("TAP"); w2.syncTransformToBody();
  new Block("jump", 0, 0.4, -3.2).syncTransformToBody();
  deselectBlock();
}

function loadCustomWorld(id) {
  clearScene();
  const data = JSON.parse(localStorage.getItem(`bw_world_${id}`) || "[]");
  data.forEach(item => {
    const b = new Block(item.type, item.x, item.y, item.z, item.color, item.texture, item.code);
    b.syncTransformToBody();
  });
  deselectBlock();
}

function clearScene() {
  blocks.forEach((b) => { scene.remove(b.mesh); world.remove(b.body); });
  blocks = []; deselectBlock();
}

function selectBlock(block) {
  if (currentMode === "play") return;
  blocks.forEach((b) => { if (b.outline) b.outline.visible = (b === block); });
  selectedBlock = block;
  document.getElementById("bw-block-gizmo").classList.remove("hidden");
  
  // Exibe o painel de programação para QUALQUER bloco selecionado
  const popup = document.getElementById("rocket-logic-popup");
  popup.classList.remove("hidden");
  updateProgrammingPanel(block);
  updateOverlayPositions();
}

function deselectBlock() {
  blocks.forEach((b) => { if (b.outline) b.outline.visible = false; });
  selectedBlock = null;
  document.getElementById("bw-block-gizmo").classList.add("hidden");
  document.getElementById("rocket-logic-popup").classList.add("hidden");
}

function updateOverlayPositions() {
  if (!selectedBlock) return;
  const container = document.getElementById("canvas-container");
  const vector = selectedBlock.mesh.position.clone();
  vector.project(camera);
  const x = (vector.x * 0.5 + 0.5) * container.clientWidth;
  const y = (-vector.y * 0.5 + 0.5) * container.clientHeight;

  const gizmo = document.getElementById("bw-block-gizmo");
  gizmo.style.left = `${x + 28}px`; gizmo.style.top = `${y - 28}px`;

  const popup = document.getElementById("rocket-logic-popup");
  if (!popup.classList.contains("hidden")) {
    popup.style.left = `${Math.max(195, x - 48)}px`;
    popup.style.top = `${y + 34}px`;
  }
}

function updateProgrammingPanel(block) {
  const slot = document.getElementById("slot-event");
  const actionSlot = document.getElementById("slot-action");
  
  if (block.code) {
    slot.innerHTML = `<span class="ico">👈</span><span style="font-size:6px;">${block.code}</span>`;
    slot.classList.add("filled");
  } else {
    slot.innerHTML = `▶`;
    slot.classList.remove("filled");
  }

  if (block.isRocket) {
    actionSlot.innerHTML = `<span class="ico">🚀</span><span style="font-size:6px;">FIRE</span>`;
  } else if (block.isWheel) {
    actionSlot.innerHTML = `<span class="ico">⚙️</span><span style="font-size:6px;">SPIN</span>`;
  } else {
    actionSlot.innerHTML = `<span class="ico">✨</span><span style="font-size:6px;">ACT</span>`;
  }
}

function setupDragAndDrop() {
  // Configura arrastamento para blocos, texturas, cores e códigos
  document.querySelectorAll("[data-block], [data-texture], [data-color], [data-code]").forEach(el => {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (e) => {
      draggedItemData = {
        block: el.getAttribute("data-block"),
        texture: el.getAttribute("data-texture"),
        color: el.getAttribute("data-color"),
        code: el.getAttribute("data-code")
      };
    });
  });

  const container = document.getElementById("canvas-container");
  container.addEventListener("dragover", (e) => e.preventDefault());
  container.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!draggedItemData || currentMode === "play") return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(blocks.map(b => b.mesh));

    if (intersects.length > 0) {
      const found = blocks.find(b => b.mesh === intersects[0].object);
      if (found) {
        if (draggedItemData.texture) {
          found.setTexture(draggedItemData.texture);
        } else if (draggedItemData.color) {
          found.setColor(draggedItemData.color);
        }
      }
    } else if (draggedItemData.block) {
      const newB = new Block(draggedItemData.block, 0, 1.0, 0);
      newB.syncTransformToBody();
    }
    draggedItemData = null;
  });

  // Arrastar código para o slot de programação de qualquer objeto selecionado
  const slotEvent = document.getElementById("slot-event");
  slotEvent.addEventListener("dragover", (e) => e.preventDefault());
  slotEvent.addEventListener("drop", (e) => {
    e.preventDefault();
    if (draggedItemData && draggedItemData.code && selectedBlock) {
      selectedBlock.setProgramCode(draggedItemData.code);
      updateProgrammingPanel(selectedBlock);
    }
    draggedItemData = null;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(init3D, 50);

  document.getElementById("btn-play").addEventListener("click", () => {
    if (currentMode === "build") {
      currentMode = "play"; isPlaying = true; deselectBlock();
      document.getElementById("btn-play").textContent = "■";
      document.getElementById("left-dock").classList.add("hidden-play");
      document.getElementById("play-left-touch-area").classList.remove("hidden");
      blocks.forEach((b) => {
        b.syncTransformToBody();
        if (b.body.mass > 0) { b.body.type = CANNON.Body.DYNAMIC; b.body.wakeUp(); }
      });
    } else {
      currentMode = "build"; isPlaying = false; leftSidePressed = false;
      document.getElementById("btn-play").textContent = "▶";
      document.getElementById("left-dock").classList.remove("hidden-play");
      document.getElementById("play-left-touch-area").classList.add("hidden");
      blocks.forEach((b) => {
        if (b.flameMesh) b.flameMesh.visible = false;
        b.body.velocity.set(0, 0, 0); b.body.angularVelocity.set(0, 0, 0);
        b.body.type = CANNON.Body.STATIC;
        b.mesh.position.copy(b.initialPos); b.mesh.quaternion.copy(b.initialQuat);
        b.syncTransformToBody();
      });
    }
  });

  document.getElementById("btn-rotate").addEventListener("click", () => {
    if (!selectedBlock) return;
    selectedBlock.mesh.rotation.y += Math.PI / 2;
    selectedBlock.syncTransformToBody();
    saveCurrentWorld();
  });

  document.getElementById("btn-delete").addEventListener("click", () => {
    if (selectedBlock) selectedBlock.remove();
  });

  document.addEventListener("pointerdown", (event) => {
    if (currentMode === "play") return;
    if (event.clientX < 190 || event.target.closest("#left-dock") || event.target.closest(".editor-top-right") || event.target.closest(".bw-block-gizmo")) {
      return;
    }

    const container = document.getElementById("canvas-container");
    const rect = container.getBoundingClientRect();
    
    mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
    
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
  });

  document.addEventListener("pointermove", (event) => {
    if (!isDraggingBlock || !selectedBlock || currentMode === "play") return;
    const container = document.getElementById("canvas-container");
    const rect = container.getBoundingClientRect();
    
    mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersectPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
      const target = intersectPoint.add(dragOffset);
      selectedBlock.mesh.position.x = Math.round(target.x * 2) / 2;
      selectedBlock.mesh.position.z = Math.round(target.z * 2) / 2;
      selectedBlock.syncTransformToBody();
      updateOverlayPositions();
    }
  });

  document.addEventListener("pointerup", () => {
    if (isDraggingBlock) {
      isDraggingBlock = false;
      saveCurrentWorld();
    }
  });

  const touchLeft = document.getElementById("play-left-touch-area");
  touchLeft.addEventListener("pointerdown", () => { leftSidePressed = true; });
  touchLeft.addEventListener("pointerup", () => { leftSidePressed = false; });
  touchLeft.addEventListener("pointerleave", () => { leftSidePressed = false; });
});