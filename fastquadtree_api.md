# fastquadtree: Implementation-Oriented Usage Spec (Python + Rust)

This document is designed to be “copy-paste reliable” for code generation. It lists the *exact* public entry points and the behavioral contracts you should assume when writing code that uses `fastquadtree`.

---

## 1) Which class should you use?

### Point data (x, y)

Use `fastquadtree.QuadTree`.

Typical use cases:

* spatial indexing of points
* range queries (“give me all points in this box”)
* k-NN queries (“closest k points to this location”)

### Rectangle data (min_x, min_y, max_x, max_y)

Use `fastquadtree.RectQuadTree`.

Typical use cases:

* entity bounding boxes
* collision broadphase
* spatial joins and rectangle intersection queries

### Migrating from `pyqtree`

Use `fastquadtree.pyqtree.Index` as a drop-in shim. ([elan456.github.io][1])

---

## 2) Coordinate + rectangle conventions (do not guess)

### Bounds / rectangles are always ordered as:

`(min_x, min_y, max_x, max_y)` ([PyPI][2])

### Point containment rule (important on edges)

Containment is **closed on min edges and open on max edges**:

* `x >= min_x and x < max_x and y >= min_y and y < max_y` ([PyPI][2])

This only matters for points exactly on the boundary.

---

## 3) Python API: QuadTree (points)

### Constructor

`QuadTree(bounds, capacity, max_depth=None, track_objects=False, start_id=1)` ([PyPI][2])

Key parameters:

* `bounds`: `(min_x, min_y, max_x, max_y)` world bounds ([elan456.github.io][3])
* `capacity`: max number of items in a node before it subdivides ([elan456.github.io][3])
* `max_depth`: optional depth cap. If `None`, the engine chooses (and you can inspect it via `get_inner_max_depth()`). ([elan456.github.io][3])
* `track_objects`: enables id ↔ Python object mapping ([elan456.github.io][3])
* `dtype`: coordinate type in the native engine: `'f32'` (default), `'f64'`, `'i32'`, `'i64'` ([elan456.github.io][3])

### Insert (single)

`insert(xy, *, id=None, obj=None) -> int` ([PyPI][2])

* `xy` must be `(x, y)`.
* If `id` is omitted, an id is auto-assigned starting at `start_id`. ([PyPI][2])
* If `track_objects=False`, passing `obj` is allowed but object retrieval helpers (`get`, `delete_by_object`, etc.) are not meaningful.

### Insert (bulk)

`insert_many(geoms, objs=None) -> int` ([elan456.github.io][3])

Accepted `geoms` forms:

* a Python sequence of points `[(x, y), ...]`
* a NumPy array of shape `(N, 2)` whose dtype matches the quadtree’s dtype (for speed) ([elan456.github.io][3])

Returns:

* number of inserted items (with contiguous auto-assigned ids). ([elan456.github.io][3])

### Query (range)

`query(rect, *, as_items=False) -> list` ([elan456.github.io][3])

* `rect` is `(min_x, min_y, max_x, max_y)`.
* If `as_items=False`, returns `[(id, x, y), ...]`. ([elan456.github.io][3])
* If `as_items=True`, returns `[PointItem, ...]` where:

  * `item.id_` (int)
  * `item.geom` is `(x, y)`
  * `item.obj` is attached object (or `None`) ([elan456.github.io][4])

### Query to NumPy

`query_np(rect) -> (ids, locations)` where:

* `ids`: `NDArray[np.uint64]` shape `(N,)`
* `locations`: `NDArray[np.floating]` shape `(N, 2)` ([elan456.github.io][3])

### Nearest neighbor

`nearest_neighbor(xy, *, as_item=False) -> (id, x, y) | PointItem | None` ([elan456.github.io][3])

Returns `None` if the tree is empty.

### k nearest neighbors

`nearest_neighbors(xy, k, *, as_items=False) -> list` ([elan456.github.io][3])

Returns results in increasing distance order.

### Delete

`delete(id_, xy) -> bool` (requires id and **exact** geometry) ([PyPI][2])

If `track_objects=True`, you can also do:

* `delete_by_object(obj) -> bool` ([elan456.github.io][3])

### Object tracking helpers (only meaningful if `track_objects=True`)

* `get(id_) -> obj`
* `attach(id_, obj)` to attach or replace an object ([elan456.github.io][3])
* `get_all_objects()`
* `get_all_items()` ([elan456.github.io][3])

### Misc

* `count_items()` returns native count ([elan456.github.io][3])
* `get_inner_max_depth()` returns the depth cap chosen/used by the core when `max_depth=None` ([elan456.github.io][3])
* `get_all_node_boundaries()` returns node rectangles for visualization ([elan456.github.io][3])

### Serialization

* `to_bytes() -> bytes`
* `from_bytes(data, dtype='f32') -> QuadTree` (specify `dtype` if you saved with non-default) ([elan456.github.io][3])
* `to_dict() -> dict` (includes a binary core blob and metadata) ([elan456.github.io][3])

---

## 4) Python API: RectQuadTree (rectangles)

RectQuadTree mirrors the point API, but geometries are rectangles.

### Query (intersection)

`query(rect, *, as_items=False) -> list` returns all items that **intersect** the query rectangle. ([elan456.github.io][5])

Return formats:

* `as_items=False`: `[(id, x0, y0, x1, y1), ...]` ([elan456.github.io][5])
* `as_items=True`: `[RectItem, ...]` where:

  * `item.id_` (int)
  * `item.geom` is `(min_x, min_y, max_x, max_y)`
  * `item.obj` is attached object (or `None`) ([elan456.github.io][6])

### Nearest neighbor semantics for rectangles

Nearest neighbor uses Euclidean distance to the **nearest edge** of rectangles. ([elan456.github.io][5])

---

## 5) pyqtree shim (Index)

Use this only if you need the original pyqtree API surface.

Example:

* `Index(bbox=(0, 0, 100, 100))`
* `insert(item, (min_x, min_y, max_x, max_y))`
* `intersect((min_x, min_y, max_x, max_y))` ([elan456.github.io][1])

---

## 6) Correctness + robustness rules (important for generated code)

### Always validate bounds before inserting

Out-of-bounds inserts raise `ValueError`. ([elan456.github.io][3])

### Avoid `capacity=1` unless you *really* mean it

With highly clustered or duplicate points, extremely small capacities can force deep splitting. Prefer something like 8–64 unless you have a reason to go smaller. ([PyPI][2])

### Choose dtype based on your coordinate scale

* If coordinates can be very large or you care about more precision, prefer `dtype='f64'`.
* If coordinates are grid-like integers, use `i32` or `i64`. (`dtype` options are explicitly supported.) ([elan456.github.io][3])

### If you use NumPy bulk insert, match dtypes

For peak speed and to avoid surprises, construct the NumPy array with a dtype that matches the tree (`np.float32` for `'f32'`, etc.). ([elan456.github.io][3])

### Thread-safety

Trees are **not** thread-safe. If multiple threads mutate the same tree, use external synchronization. ([elan456.github.io][3])

---

## 7) Rust core usage (no Python)

If you want to use the Rust implementation directly:

### Add dependency

In `Cargo.toml`:

```toml
[dependencies]
fastquadtree = { git = "https://github.com/Elan456/fastquadtree" }
```

([elan456.github.io][7])

### Minimal example

```rust
use fastquadtree::{Point, Rect, Item, QuadTree};

fn main() {
    let boundary: Rect<f32> = Rect { min_x: 0.0, min_y: 0.0, max_x: 100.0, max_y: 100.0 };

    // QuadTree::new(boundary, capacity, max_depth)
    let mut qt: QuadTree<f32> = QuadTree::new(boundary, 16, 4);

    let item: Item<f32> = Item { id: 1, point: Point { x: 10.0, y: 10.0 } };
    qt.insert(item);

    let range: Rect<f32> = Rect { min_x: 5.0, min_y: 5.0, max_x: 15.0, max_y: 15.0 };
    let found_items = qt.query(range);

    println!("Found items: {:?}", found_items);
}
```

([elan456.github.io][7])

### Reproducibility tip

Pin to a commit SHA via `rev = "<commit-sha>"` for deterministic builds. ([elan456.github.io][7])

---

## 8) LLM “do not mess this up” checklist

When generating code that uses `fastquadtree`, you MUST:

1. Use rectangle order `(min_x, min_y, max_x, max_y)` everywhere.
2. Treat max edges as exclusive for point containment.
3. Pass `(x, y)` for point geometry and `(min_x, min_y, max_x, max_y)` for rect geometry.
4. Handle `None` return for `nearest_neighbor` on empty trees.
5. Use `as_items=True` only if you actually need `item.id_`, `item.geom`, `item.obj`.
6. If deleting, pass **both** `id_` and the **exact** geometry used at insertion time.
7. If you need `obj` retrieval or `delete_by_object`, construct the tree with `track_objects=True`.
8. If bulk inserting NumPy arrays, match array dtype to the tree’s dtype.

If you want, paste the snippet of code the “other LLM” is trying to produce (Python or Rust), and I’ll rewrite it into the safest, idiomatic `fastquadtree` usage pattern.

[1]: https://elan456.github.io/fastquadtree/api/pyqtree/ "pyqtree - fastquadtree"
[2]: https://pypi.org/project/fastquadtree/ "fastquadtree · PyPI"
[3]: https://elan456.github.io/fastquadtree/api/quadtree/ "QuadTree - fastquadtree"
[4]: https://elan456.github.io/fastquadtree/api/point_item/ "PointItem - fastquadtree"
[5]: https://elan456.github.io/fastquadtree/api/rect_quadtree/ "RectQuadTree - fastquadtree"
[6]: https://elan456.github.io/fastquadtree/api/rect_item/ "RectItem - fastquadtree"
[7]: https://elan456.github.io/fastquadtree/rust_usage/ "Rust Usage - fastquadtree"
