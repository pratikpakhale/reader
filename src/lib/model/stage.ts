/**
 * The imperative half of the 3D viewer: a renderer, a studio, a camera that
 * frames the model, and a frame loop that only runs while something moves —
 * an idle model costs no battery.
 */

import {
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export interface Stage {
  /** Plays a clip by index, or pauses with null. */
  play(clip: number | null): void;
  resetView(): void;
  dispose(): void;
}

function cssColor(name: string) {
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888888");
}

function materialsOf(object: Object3D): Material[] {
  const found = new Set<Material>();
  object.traverse((child) => {
    const material = (child as Mesh).material as Material | Material[] | undefined;
    if (!material) return;
    for (const one of Array.isArray(material) ? material : [material]) found.add(one);
  });
  return [...found];
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    const mesh = child as Mesh;
    mesh.geometry?.dispose();
  });
  for (const material of materialsOf(object)) {
    for (const value of Object.values(material)) {
      if (value && typeof value === "object" && (value as Texture).isTexture) (value as Texture).dispose();
    }
    material.dispose();
  }
}

export function createStage(container: HTMLElement, model: Object3D, clips: AnimationClip[]): Stage {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.className = "block size-full outline-none";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;
  room.dispose();

  // Frame the model: centred on its footprint, resting on the floor.
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.length() / 2, 1e-6);
  const centre = box.getCenter(new Vector3());
  model.position.sub(new Vector3(centre.x, box.min.y, centre.z));
  scene.add(model);
  const target = new Vector3(0, size.y / 2, 0);

  model.traverse((child) => {
    if ((child as Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const camera = new PerspectiveCamera(40, 1, radius / 1000, radius * 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = radius / 100;
  controls.maxDistance = radius * 50;

  // Framed by the tighter of the two fields of view, so a portrait phone sees
  // the whole model and not just its middle.
  const home = () => {
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2);
    camera.position.copy(target).add(new Vector3(0.9, 0.55, 1).normalize().multiplyScalar(distance * 1.05));
    controls.target.copy(target);
    camera.updateProjectionMatrix();
    controls.update();
  };
  home();
  let framed = true;
  controls.addEventListener("start", () => (framed = false));

  // Studio key light for the shadow; the room environment does the rest.
  const key = new DirectionalLight(0xffffff, 1.2);
  key.position.set(radius * 1.5, radius * 3, radius * 2);
  key.target.position.copy(target);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  const shadowCamera = key.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -radius * 2;
  shadowCamera.right = shadowCamera.top = radius * 2;
  shadowCamera.near = radius / 100;
  shadowCamera.far = radius * 10;
  scene.add(key, key.target);

  const floor = new Mesh(new PlaneGeometry(radius * 8, radius * 8), new ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const gridSize = Math.pow(10, Math.ceil(Math.log10(radius * 4)));
  let grid: GridHelper | null = null;
  scene.add(floor);

  const paintTheme = () => {
    scene.background = cssColor("--sunken");
    if (grid) {
      scene.remove(grid);
      grid.dispose();
    }
    grid = new GridHelper(gridSize, 20, cssColor("--line-strong"), cssColor("--line"));
    grid.position.y = -radius / 2000;
    scene.add(grid);
  };
  paintTheme();

  const mixer = clips.length ? new AnimationMixer(model) : null;
  let action: AnimationAction | null = null;
  let playing = false;

  // Render on demand: a frame is requested when something changes, and the
  // loop keeps itself alive only while damping or an animation is still moving.
  let frame = 0;
  let last = 0;
  const render = (time: number) => {
    frame = 0;
    const delta = last ? Math.min((time - last) / 1000, 0.1) : 0;
    last = time;
    const moving = controls.update(delta);
    if (playing) mixer?.update(delta);
    renderer.render(scene, camera);
    // controls.update() may already have asked for the next frame via "change".
    if (moving || playing) frame ||= requestAnimationFrame(render);
    else if (!frame) last = 0;
  };
  const invalidate = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener("change", invalidate);

  const resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    if (framed) home();
    else camera.updateProjectionMatrix();
    invalidate();
  });
  resize.observe(container);

  const theme = new MutationObserver(() => {
    paintTheme();
    invalidate();
  });
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return {
    play(index) {
      if (!mixer) return;
      if (index === null) {
        playing = false;
        return;
      }
      const clip = clips[index];
      if (action?.getClip() !== clip) {
        action?.stop();
        action = mixer.clipAction(clip).reset().play();
      }
      playing = true;
      invalidate();
    },
    resetView() {
      home();
      framed = true;
      invalidate();
    },
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
      controls.dispose();
      mixer?.stopAllAction();
      mixer?.uncacheRoot(model);
      scene.remove(model);
      disposeObject(model);
      disposeObject(floor);
      grid?.dispose();
      environment.dispose();
      pmrem.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
