using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace BeybladePhysicsPoc
{
    public static class SimpleStlMeshLoader
    {
        public static bool TryLoad(string path, out Mesh mesh, out string errorMessage)
        {
            mesh = null;
            errorMessage = string.Empty;

            if (string.IsNullOrEmpty(path) || !File.Exists(path))
            {
                errorMessage = "STL file not found.";
                return false;
            }

            byte[] bytes;
            try
            {
                bytes = File.ReadAllBytes(path);
            }
            catch (Exception exception)
            {
                errorMessage = "Could not read STL: " + exception.Message;
                return false;
            }

            if (bytes.Length < 84)
            {
                errorMessage = "STL file is empty or incomplete.";
                return false;
            }

            try
            {
                mesh = LooksLikeBinaryStl(bytes) ? ParseBinary(bytes) : ParseAscii(bytes);
                if (mesh == null || mesh.vertexCount == 0)
                {
                    errorMessage = "STL produced no geometry.";
                    return false;
                }

                mesh.name = Path.GetFileNameWithoutExtension(path);
                mesh.RecalculateBounds();
                mesh.RecalculateNormals();
                return true;
            }
            catch (Exception exception)
            {
                errorMessage = "Could not parse STL: " + exception.Message;
                return false;
            }
        }

        private static bool LooksLikeBinaryStl(byte[] bytes)
        {
            if (bytes.Length < 84)
            {
                return false;
            }

            var triangleCount = BitConverter.ToUInt32(bytes, 80);
            var expectedLength = 84L + triangleCount * 50L;
            if (expectedLength == bytes.Length)
            {
                return true;
            }

            var header = Encoding.ASCII.GetString(bytes, 0, Mathf.Min(bytes.Length, 80)).TrimStart();
            return !header.StartsWith("solid", StringComparison.OrdinalIgnoreCase);
        }

        private static Mesh ParseBinary(byte[] bytes)
        {
            var triangleCount = BitConverter.ToUInt32(bytes, 80);
            if (triangleCount > 300000)
            {
                throw new InvalidDataException("Too many STL triangles for this proof-of-concept.");
            }

            var vertices = new List<Vector3>((int)triangleCount * 3);
            var triangles = new List<int>((int)triangleCount * 3);
            var offset = 84;

            for (var triangle = 0; triangle < triangleCount; triangle++)
            {
                offset += 12;
                for (var vertex = 0; vertex < 3; vertex++)
                {
                    var x = BitConverter.ToSingle(bytes, offset);
                    var y = BitConverter.ToSingle(bytes, offset + 4);
                    var z = BitConverter.ToSingle(bytes, offset + 8);
                    vertices.Add(ConvertCadZUpToUnityYUp(new Vector3(x, y, z)));
                    triangles.Add(vertices.Count - 1);
                    offset += 12;
                }

                offset += 2;
            }

            return BuildMesh(vertices, triangles);
        }

        private static Mesh ParseAscii(byte[] bytes)
        {
            var text = Encoding.UTF8.GetString(bytes);
            var vertices = new List<Vector3>();
            var triangles = new List<int>();
            var lines = text.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var rawLine in lines)
            {
                var line = rawLine.Trim();
                if (!line.StartsWith("vertex ", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var parts = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 4)
                {
                    continue;
                }

                var cad = new Vector3(ParseFloat(parts[1]), ParseFloat(parts[2]), ParseFloat(parts[3]));
                vertices.Add(ConvertCadZUpToUnityYUp(cad));
                triangles.Add(vertices.Count - 1);
            }

            if (vertices.Count % 3 != 0)
            {
                throw new InvalidDataException("ASCII STL vertex count is not divisible by three.");
            }

            return BuildMesh(vertices, triangles);
        }

        private static Mesh BuildMesh(List<Vector3> vertices, List<int> triangles)
        {
            var mesh = new Mesh();
            if (vertices.Count > 65535)
            {
                mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            }

            mesh.SetVertices(vertices);
            mesh.SetTriangles(triangles, 0);
            return mesh;
        }

        private static Vector3 ConvertCadZUpToUnityYUp(Vector3 cad)
        {
            return new Vector3(cad.x, cad.z, cad.y);
        }

        private static float ParseFloat(string value)
        {
            return float.Parse(value, NumberStyles.Float, CultureInfo.InvariantCulture);
        }
    }
}
