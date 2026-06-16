// dispose.js — free GPU resources (geometries, materials, textures) for a group's
// children, then detach them. Three.js Group.clear() only detaches; it does not free
// GPU memory, so this is required before rebuilding levels to avoid leaks.
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
  group.clear();
}
