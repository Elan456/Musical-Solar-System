# Quadtree-Friendly Spatial Index Options (Python)

Goal: accelerate distance-threshold queries and KNN over planet positions (2D) by avoiding O(n²) pairwise checks.

## 1) pyqtree (quadtree, pure Python)
- What it is: PR-quad implementation for rectangular extents; great for “which objects fall near this box/circle?” style culling.
- Why use it here: direct quadtree semantics; easy to insert/update per step if planet count is modest (<10–50).
- API sketch:
  ```python
  from pyqtree import Index

  idx = Index(bbox=(-max_r, -max_r, max_r, max_r))
  for i, (x, y) in enumerate(planets_xy):
      idx.insert(item=i, bbox=(x, y, x, y))

  # range query (square); for circle, precompute square then post-filter by radius
  candidates = idx.intersect((qx - r, qy - r, qx + r, qy + r))
  ```
- Notes: bounding boxes only; for true distance checks, post-filter by Euclidean distance.

## 2) Rtree (libspatialindex-backed R-tree)
- What it is: thin Python wrapper over libspatialindex; supports rectangles and nearest-neighbor queries.
- Why use it here: faster inserts/queries than pure Python; good for larger n (hundreds+ bodies).
- API sketch:
  ```python
  from rtree import index
  idx = index.Index()
  for i, (x, y) in enumerate(planets_xy):
      idx.insert(i, (x, y, x, y))

  # distance-limited: ask for nearest and filter by radius
  for hit_id in idx.nearest((qx, qy, qx, qy), num_results=10, objects=False):
      ...
  ```
- Notes: requires native lib; works with rectangles so still post-filter by circle radius.

## 3) scipy.spatial.cKDTree (KD-tree, C-accelerated)
- What it is: highly optimized KD-tree for n-D; supports ball queries and k-NN directly.
- Why use it here: fast ball queries (`query_ball_point`) give distance-threshold neighbors without manual filtering.
- API sketch:
  ```python
  from scipy.spatial import cKDTree
  tree = cKDTree(planets_xy)  # list of (x, y)
  neighbors = tree.query_ball_point([qx, qy], r=max_dist)  # indices within radius
  dists, idxs = tree.query([qx, qy], k=5)  # KNN
  ```
- Notes: not a quadtree, but usually faster and simpler for KNN and radius search in 2D.

## 4) scikit-learn neighbors (KDTree/BallTree)
- What it is: sklearn wrappers with similar interfaces; supports batch queries and different metrics.
- Why use it here: if sklearn is already a dependency, `BallTree` can handle non-Euclidean metrics; KDTree for Euclidean.
- API sketch:
  ```python
  from sklearn.neighbors import KDTree
  tree = KDTree(planets_xy)
  idxs = tree.query_radius([target_xy], r=max_dist)[0]
  dists, idxs = tree.query([target_xy], k=5)
  ```
- Notes: incurs sklearn dependency; not a quadtree but performant.

## Selection guidance
- Want actual quad semantics and minimal deps: use pyqtree; keep planet count modest; post-filter by radius.
- Need speed at larger n without hand-tuning: prefer cKDTree (SciPy) for radius/KNN; fastest path for Euclidean distance.
- Need native-accelerated rectangle index and can install libspatialindex: use Rtree.
- Already shipping sklearn: reuse KDTree/BallTree, skip extra deps.

## Integration tips
- Rebuild the index each simulation frame only if n is small; otherwise maintain and update moving bodies.
- For distance-threshold culling: do an index range query then post-filter exact distance to avoid false positives from rectangular bounds.
- For KNN-based force approximation: use `query`/`nearest` to fetch top-k neighbors per planet, then compute exact forces on that subset.
