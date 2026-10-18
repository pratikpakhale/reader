/**
 * Turns any supported 3D file into a three.js object, with its animations. Everything is parsed from bytes already in memory:
 * a reference to a file outside this one can't be followed, so it's either
 * reported up front (glTF) or quietly resolved to nothing (textures in
 * OBJ/FBX/DAE), never fetched.
 */

import {
  BufferGeometry,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  type AnimationClip,
  type Material,
  type Object3D,
} from "three";

export interface LoadedModel {
  object: Object3D;
  animations: AnimationClip[];
  /** External files the model referred to and couldn't have. */
  missing: number;
}

function neutralMaterial(vertexColors = false) {
  return new MeshStandardMaterial({ color: vertexColors ? 0xffffff : 0xb9bec2, roughness: 0.62, metalness: 0.04, vertexColors });
}

function fromGeometry(geometry: BufferGeometry, pointCloud = false): Object3D {
  const colored = Boolean(geometry.getAttribute("color"));
  if (pointCloud) {
    return new Points(geometry, new PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: colored, color: colored ? 0xffffff : 0x8a9096 }));
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  return new Mesh(geometry, neutralMaterial(colored));
}

/** glTF can point at sibling .bin and image files; we only ever have the one file. */
function externalReferences(json: { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> }) {
  return [...(json.buffers ?? []), ...(json.images ?? [])].filter(
    (resource) => resource.uri && !resource.uri.startsWith("data:"),
  ).length;
}

function hasGeometry(object: Object3D) {
  let found = false;
  object.traverse((child) => {
    if ((child instanceof Mesh || child instanceof Points) && (child.geometry as BufferGeometry).getAttribute("position")?.count) {
      found = true;
    }
  });
  return found;
}

/** OBJ without its .mtl arrives flat and shiny; the studio material reads better. */
function restyle(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const old = child.material as Material | Material[];
    for (const material of Array.isArray(old) ? old : [old]) material.dispose();
    child.material = neutralMaterial(Boolean((child.geometry as BufferGeometry).getAttribute("color")));
  });
}

export async function loadModel(blob: Blob, name: string): Promise<LoadedModel> {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  let missing = 0;
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    missing += 1;
    return "data:,";
  });

  const buffer = await blob.arrayBuffer();
  const text = () => new TextDecoder().decode(buffer);
  let object: Object3D;
  let animations: AnimationClip[] = [];

  switch (extension) {
    case "glb":
    case "gltf": {
      const binary = new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) === "glTF";
      if (!binary) {
        const json = JSON.parse(text());
        const external = externalReferences(json);
        if (external) {
          throw new Error(
            `This .gltf refers to ${external} separate file${external === 1 ? "" : "s"} (buffers or textures) that weren't opened with it. A .glb, or a .gltf with embedded data, opens on its own.`,
          );
        }
      }
      const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/loaders/DRACOLoader.js"),
        import("three/addons/libs/meshopt_decoder.module.js"),
      ]);
      // The Draco decoder is vendored into public/, so compressed meshes decode
      // without reaching a CDN.
      const draco = new DRACOLoader(manager).setDecoderPath("/vendor/draco/");
      const gltf = await new GLTFLoader(manager)
        .setDRACOLoader(draco)
        .setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(binary ? buffer : text(), "")
        .finally(() => draco.dispose());
      object = gltf.scene;
      animations = gltf.animations;
      break;
    }
    case "obj": {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      object = new OBJLoader(manager).parse(text());
      restyle(object);
      break;
    }
    case "stl": {
      const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
      object = fromGeometry(new STLLoader(manager).parse(buffer));
      break;
    }
    case "ply": {
      const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
      const geometry = new PLYLoader(manager).parse(buffer);
      // A PLY without faces is a scan: a cloud of points.
      object = fromGeometry(geometry, !geometry.index);
      break;
    }
    case "fbx": {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      object = new FBXLoader(manager).parse(buffer, "");
      animations = object.animations;
      break;
    }
    case "3mf": {
      const { ThreeMFLoader } = await import("three/addons/loaders/3MFLoader.js");
      object = new ThreeMFLoader(manager).parse(buffer);
      break;
    }
    case "dae": {
      const { ColladaLoader } = await import("three/addons/loaders/ColladaLoader.js");
      const collada = new ColladaLoader(manager).parse(text(), "");
      if (!collada) throw new Error("This COLLADA file has no scene.");
      object = collada.scene;
      animations = collada.scene.animations;
      break;
    }
    case "usdz": {
      const { USDLoader } = await import("three/addons/loaders/USDLoader.js");
      object = new USDLoader(manager).parse(buffer);
      break;
    }
    case "3ds": {
      const { TDSLoader } = await import("three/addons/loaders/TDSLoader.js");
      object = new TDSLoader(manager).parse(buffer, "");
      break;
    }
    default:
      throw new Error(`.${extension} isn't a 3D format this reader knows.`);
  }

  if (!hasGeometry(object)) throw new Error("The file parsed, but there's no geometry in it.");
  return { object, animations, missing };
}
