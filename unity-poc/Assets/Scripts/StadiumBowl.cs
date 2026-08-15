using System.Collections.Generic;
using UnityEngine;

namespace BeybladePhysicsPoc
{
    public sealed class StadiumBowl : MonoBehaviour
    {
        public float PlayRadius = 5.6f;
        public float WallRadius = 5.55f;
        public float RingOutRadius = 6.45f;
        public float BowlDepth = 1.15f;
        public float OuterLipLift = 0.32f;
        public float TornadoRidgeRadius = 2.55f;
        public float TornadoRidgeHeight = 0.08f;
        public float WallHeight = 0.86f;

        private readonly List<Pocket> pockets = new List<Pocket>
        {
            new Pocket(136f, 33f),
            new Pocket(180f, 48f),
            new Pocket(224f, 33f)
        };

        public void Build(Material bowlMaterial, Material rimMaterial)
        {
            gameObject.layer = LayerMask.NameToLayer("Stadium");
            BuildBowlMesh(bowlMaterial);
            BuildRimSegments(rimMaterial);
            BuildTornadoRidge(rimMaterial);
        }

        public float SurfaceY(Vector3 worldPosition)
        {
            var radius = new Vector2(worldPosition.x, worldPosition.z).magnitude;
            return SurfaceYByProgress(Mathf.Min(radius / PlayRadius, 1.25f));
        }

        public Vector3 InwardNormal(Vector3 worldPosition)
        {
            var flat = new Vector3(worldPosition.x, 0f, worldPosition.z);
            if (flat.sqrMagnitude < 0.0001f)
            {
                return Vector3.zero;
            }

            return -flat.normalized;
        }

        public bool IsPocket(Vector3 worldPosition)
        {
            var angle = Mathf.Atan2(worldPosition.z, worldPosition.x) * Mathf.Rad2Deg;
            foreach (var pocket in pockets)
            {
                if (Mathf.Abs(Mathf.DeltaAngle(angle, pocket.AngleDegrees)) <= pocket.WidthDegrees * 0.5f)
                {
                    return true;
                }
            }

            return false;
        }

        public float OuterBankStartRadius()
        {
            return WallRadius - 0.72f;
        }

        private void BuildBowlMesh(Material bowlMaterial)
        {
            const int rings = 72;
            const int segments = 192;
            var vertices = new List<Vector3>((rings + 1) * segments);
            var normals = new List<Vector3>((rings + 1) * segments);
            var triangles = new List<int>(rings * segments * 6);

            for (var ring = 0; ring <= rings; ring++)
            {
                var radiusProgress = ring / (float)rings;
                var radius = PlayRadius * radiusProgress;
                var y = SurfaceYByProgress(radiusProgress);

                for (var segment = 0; segment < segments; segment++)
                {
                    var angle = (Mathf.PI * 2f * segment) / segments;
                    vertices.Add(new Vector3(Mathf.Cos(angle) * radius, y, Mathf.Sin(angle) * radius));
                    normals.Add(Vector3.up);
                }
            }

            for (var ring = 0; ring < rings; ring++)
            {
                for (var segment = 0; segment < segments; segment++)
                {
                    var nextSegment = (segment + 1) % segments;
                    var lowerA = ring * segments + segment;
                    var lowerB = ring * segments + nextSegment;
                    var upperA = (ring + 1) * segments + segment;
                    var upperB = (ring + 1) * segments + nextSegment;

                    triangles.Add(lowerA);
                    triangles.Add(upperA);
                    triangles.Add(upperB);
                    triangles.Add(lowerA);
                    triangles.Add(upperB);
                    triangles.Add(lowerB);
                }
            }

            var mesh = new Mesh
            {
                name = "Procedural Stadium Bowl",
                indexFormat = UnityEngine.Rendering.IndexFormat.UInt32
            };
            mesh.SetVertices(vertices);
            mesh.SetNormals(normals);
            mesh.SetTriangles(triangles, 0);
            mesh.RecalculateBounds();
            mesh.RecalculateNormals();

            var filter = gameObject.AddComponent<MeshFilter>();
            filter.sharedMesh = mesh;

            var renderer = gameObject.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = bowlMaterial;

            var collider = gameObject.AddComponent<MeshCollider>();
            collider.sharedMesh = mesh;
            collider.sharedMaterial = CreateStadiumPhysicMaterial();
        }

        private void BuildRimSegments(Material rimMaterial)
        {
            const int segments = 56;
            var rimSurfaceY = SurfaceYByProgress(1f);
            var arcLength = (Mathf.PI * 2f * WallRadius) / segments;

            for (var index = 0; index < segments; index++)
            {
                var angle = (Mathf.PI * 2f * index) / segments;
                var angleDegrees = angle * Mathf.Rad2Deg;
                if (IsPocketAngle(angleDegrees))
                {
                    continue;
                }

                var segment = GameObject.CreatePrimitive(PrimitiveType.Cube);
                segment.name = "Segmented Rim Collider";
                segment.layer = LayerMask.NameToLayer("Stadium");
                segment.transform.SetParent(transform, false);
                segment.transform.position = new Vector3(Mathf.Cos(angle) * WallRadius, rimSurfaceY + WallHeight * 0.52f, Mathf.Sin(angle) * WallRadius);
                segment.transform.rotation = Quaternion.Euler(0f, -angleDegrees, 0f);
                segment.transform.localScale = new Vector3(0.28f, WallHeight, arcLength * 1.08f);
                segment.GetComponent<Renderer>().sharedMaterial = rimMaterial;
                segment.GetComponent<Collider>().sharedMaterial = CreateStadiumPhysicMaterial();
            }
        }

        private void BuildTornadoRidge(Material rimMaterial)
        {
            const int segments = 64;
            var arcLength = (Mathf.PI * 2f * TornadoRidgeRadius) / segments;

            for (var index = 0; index < segments; index++)
            {
                var angle = (Mathf.PI * 2f * index) / segments;
                var angleDegrees = angle * Mathf.Rad2Deg;
                var y = SurfaceY(new Vector3(Mathf.Cos(angle) * TornadoRidgeRadius, 0f, Mathf.Sin(angle) * TornadoRidgeRadius));
                var ridge = GameObject.CreatePrimitive(PrimitiveType.Cube);
                ridge.name = "Tornado Ridge Segment";
                ridge.layer = LayerMask.NameToLayer("Stadium");
                ridge.transform.SetParent(transform, false);
                ridge.transform.position = new Vector3(Mathf.Cos(angle) * TornadoRidgeRadius, y + TornadoRidgeHeight * 0.5f, Mathf.Sin(angle) * TornadoRidgeRadius);
                ridge.transform.rotation = Quaternion.Euler(0f, -angleDegrees, 0f);
                ridge.transform.localScale = new Vector3(0.08f, TornadoRidgeHeight, arcLength * 1.06f);
                ridge.GetComponent<Renderer>().sharedMaterial = rimMaterial;
                ridge.GetComponent<Collider>().sharedMaterial = CreateStadiumPhysicMaterial();
            }
        }

        private float SurfaceYByProgress(float radiusProgress)
        {
            var clamped = Mathf.Clamp(radiusProgress, 0f, 1.25f);
            var playable = Mathf.Min(clamped, 1f);
            var centerY = -BowlDepth * 0.72f;
            var rimY = OuterLipLift;
            var innerRise = Mathf.Pow(SmoothStep(0f, 0.72f, playable), 1.48f);
            var outerBank = Mathf.Pow(SmoothStep(0.62f, 1f, playable), 1.55f);
            var bowlProgress = Mathf.Min(innerRise * 0.46f + outerBank * 0.54f, 1f);
            var ridgeProgress = TornadoRidgeRadius / PlayRadius;
            var ridgeDistance = Mathf.Abs(clamped - ridgeProgress) / 0.072f;
            var ridgeShape = 1f - SmoothStep(0f, 1f, ridgeDistance);
            var ridgeLift = ridgeShape * ridgeShape * TornadoRidgeHeight * 0.68f;
            var outerLip = SmoothStep(1f, 1.2f, clamped) * OuterLipLift * 0.85f;

            return centerY + (rimY - centerY) * bowlProgress + ridgeLift + outerLip;
        }

        private bool IsPocketAngle(float angleDegrees)
        {
            foreach (var pocket in pockets)
            {
                if (Mathf.Abs(Mathf.DeltaAngle(angleDegrees, pocket.AngleDegrees)) <= pocket.WidthDegrees * 0.5f)
                {
                    return true;
                }
            }

            return false;
        }

        private PhysicsMaterial CreateStadiumPhysicMaterial()
        {
            var material = new PhysicsMaterial("Low Bounce Stadium")
            {
                dynamicFriction = 0.28f,
                staticFriction = 0.32f,
                bounciness = 0.015f,
                frictionCombine = PhysicsMaterialCombine.Average,
                bounceCombine = PhysicsMaterialCombine.Minimum
            };

            return material;
        }

        private static float SmoothStep(float edge0, float edge1, float value)
        {
            var t = Mathf.Clamp01((value - edge0) / (edge1 - edge0));
            return t * t * (3f - 2f * t);
        }

        private readonly struct Pocket
        {
            public Pocket(float angleDegrees, float widthDegrees)
            {
                AngleDegrees = angleDegrees;
                WidthDegrees = widthDegrees;
            }

            public readonly float AngleDegrees;
            public readonly float WidthDegrees;
        }
    }
}
