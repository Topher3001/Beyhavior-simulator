using System;
using System.Collections;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object
    {
        public string name;
        public static T FindObjectOfType<T>() where T : Object { return null; }
        public static void Destroy(Object target) { }
        public static void DestroyImmediate(Object target) { }
    }

    public class Component : Object
    {
        public GameObject gameObject { get; internal set; }
        public Transform transform { get; internal set; } = new Transform();
        public T GetComponent<T>() where T : Component, new() { return new T(); }
    }

    public class Behaviour : Component { }

    public class MonoBehaviour : Behaviour
    {
        public Coroutine StartCoroutine(IEnumerator routine) { return new Coroutine(); }
    }

    public class Coroutine { }

    public class WaitForFixedUpdate { }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType loadType) { }
    }

    public enum RuntimeInitializeLoadType { AfterSceneLoad }

    public class GameObject : Object
    {
        public Transform transform { get; } = new Transform();
        public int layer;
        public string tag;

        public GameObject(string name = "")
        {
            this.name = name;
            transform.gameObject = this;
        }

        public T AddComponent<T>() where T : Component, new()
        {
            var component = new T();
            component.gameObject = this;
            component.transform = transform;
            return component;
        }

        public T GetComponent<T>() where T : Component, new() { return AddComponent<T>(); }
        public static GameObject CreatePrimitive(PrimitiveType type) { return new GameObject(type.ToString()); }
    }

    public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }

    public class Transform : Component
    {
        public Vector3 position;
        public Quaternion rotation;
        public Vector3 localPosition;
        public Quaternion localRotation;
        public Vector3 localScale;
        public Transform parent;
        public Vector3 up => Vector3.up;

        public Transform()
        {
            transform = this;
        }

        public void SetParent(Transform parent, bool worldPositionStays = true) { this.parent = parent; }
        public void LookAt(Vector3 worldPosition) { }
    }

    public struct Vector2
    {
        public float x;
        public float y;

        public Vector2(float x, float y)
        {
            this.x = x;
            this.y = y;
        }

        public float magnitude => (float)Math.Sqrt(x * x + y * y);
    }

    public struct Vector3
    {
        public float x;
        public float y;
        public float z;

        public Vector3(float x, float y, float z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public static Vector3 zero => new Vector3(0f, 0f, 0f);
        public static Vector3 one => new Vector3(1f, 1f, 1f);
        public static Vector3 up => new Vector3(0f, 1f, 0f);
        public float magnitude => (float)Math.Sqrt(x * x + y * y + z * z);
        public float sqrMagnitude => x * x + y * y + z * z;
        public Vector3 normalized => magnitude > 0.000001f ? this / magnitude : zero;

        public static Vector3 operator +(Vector3 a, Vector3 b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
        public static Vector3 operator -(Vector3 a, Vector3 b) { return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); }
        public static Vector3 operator -(Vector3 value) { return new Vector3(-value.x, -value.y, -value.z); }
        public static Vector3 operator *(Vector3 value, float scale) { return new Vector3(value.x * scale, value.y * scale, value.z * scale); }
        public static Vector3 operator *(float scale, Vector3 value) { return value * scale; }
        public static Vector3 operator /(Vector3 value, float scale) { return new Vector3(value.x / scale, value.y / scale, value.z / scale); }
        public static float Dot(Vector3 a, Vector3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
        public static Vector3 Cross(Vector3 a, Vector3 b)
        {
            return new Vector3(
                a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z,
                a.x * b.y - a.y * b.x);
        }

        public static float Distance(Vector3 a, Vector3 b) { return (a - b).magnitude; }
        public static float Angle(Vector3 a, Vector3 b) { return 0f; }
    }

    public struct Quaternion
    {
        public static Quaternion identity => new Quaternion();
        public static Quaternion Euler(float x, float y, float z) { return new Quaternion(); }
    }

    public struct Rect
    {
        public Rect(float x, float y, float width, float height) { }
    }

    public struct Color
    {
        public float r;
        public float g;
        public float b;
        public float a;

        public Color(float r, float g, float b, float a = 1f)
        {
            this.r = r;
            this.g = g;
            this.b = b;
            this.a = a;
        }
    }

    public static class Mathf
    {
        public const float PI = (float)Math.PI;
        public const float Rad2Deg = 57.29578f;
        public static float Exp(float value) { return (float)Math.Exp(value); }
        public static float Sin(float value) { return (float)Math.Sin(value); }
        public static float Cos(float value) { return (float)Math.Cos(value); }
        public static float Atan2(float y, float x) { return (float)Math.Atan2(y, x); }
        public static float Pow(float value, float power) { return (float)Math.Pow(value, power); }
        public static float Abs(float value) { return Math.Abs(value); }
        public static float Min(float a, float b) { return Math.Min(a, b); }
        public static float Max(float a, float b) { return Math.Max(a, b); }
        public static int Min(int a, int b) { return Math.Min(a, b); }
        public static int Max(int a, int b) { return Math.Max(a, b); }
        public static int CeilToInt(float value) { return (int)Math.Ceiling(value); }
        public static float Clamp(float value, float min, float max) { return Math.Min(Math.Max(value, min), max); }
        public static float Clamp01(float value) { return Clamp(value, 0f, 1f); }
        public static float Lerp(float a, float b, float t) { return a + (b - a) * Clamp01(t); }
        public static float Repeat(float value, float length) { return value - (float)Math.Floor(value / length) * length; }
        public static float DeltaAngle(float current, float target) { return target - current; }
    }

    public static class Random
    {
        public static float Range(float minInclusive, float maxInclusive) { return minInclusive; }
    }

    public class Rigidbody : Component
    {
        public float mass;
        public float drag;
        public float angularDrag;
        public float maxAngularVelocity;
        public CollisionDetectionMode collisionDetectionMode;
        public RigidbodyInterpolation interpolation;
        public int solverIterations;
        public int solverVelocityIterations;
        public Vector3 centerOfMass;
        public Vector3 position;
        public Quaternion rotation;
        public Vector3 velocity;
        public Vector3 angularVelocity;
        public void WakeUp() { }
        public void AddTorque(Vector3 torque, ForceMode mode) { }
        public void AddForce(Vector3 force, ForceMode mode) { }
    }

    public enum ForceMode { Force }
    public enum CollisionDetectionMode { Discrete, ContinuousDynamic }
    public enum RigidbodyInterpolation { None, Interpolate }

    public class Collider : Component
    {
        public PhysicMaterial sharedMaterial;
    }

    public class SphereCollider : Collider
    {
        public float radius;
    }

    public class BoxCollider : Collider
    {
        public Vector3 size;
    }

    public class MeshCollider : Collider
    {
        public Mesh sharedMesh;
    }

    public class Collision
    {
        public Vector3 relativeVelocity;
    }

    public class PhysicMaterial : Object
    {
        public float dynamicFriction;
        public float staticFriction;
        public float bounciness;
        public PhysicMaterialCombine frictionCombine;
        public PhysicMaterialCombine bounceCombine;

        public PhysicMaterial(string name = "")
        {
            this.name = name;
        }
    }

    public enum PhysicMaterialCombine { Average, Minimum }

    public class Mesh : Object
    {
        public UnityEngine.Rendering.IndexFormat indexFormat;
        public int vertexCount;
        public Bounds bounds;
        public void SetVertices(List<Vector3> vertices) { vertexCount = vertices.Count; }
        public void SetNormals(List<Vector3> normals) { }
        public void SetTriangles(List<int> triangles, int submesh) { }
        public void RecalculateBounds() { }
        public void RecalculateNormals() { }
    }

    public struct Bounds
    {
        public Vector3 min;
        public Vector3 center;
        public Vector3 size;
    }
}

namespace UnityEngine.Rendering
{
    public enum IndexFormat { UInt16, UInt32 }
}

namespace UnityEngine
{
    public class MeshFilter : Component
    {
        public Mesh sharedMesh;
    }

    public class Renderer : Component
    {
        public Material sharedMaterial;
    }

    public class MeshRenderer : Renderer { }

    public class Material : Object
    {
        public Color color;
        public Material(Shader shader) { }
        public void SetFloat(string name, float value) { }
    }

    public class Shader : Object
    {
        public static Shader Find(string name) { return new Shader(); }
    }

    public class AudioClip : Object
    {
        public static AudioClip Create(string name, int lengthSamples, int channels, int frequency, bool stream)
        {
            return new AudioClip { name = name };
        }

        public void SetData(float[] data, int offsetSamples) { }
    }

    public class AudioSource : Component
    {
        public bool playOnAwake;
        public float spatialBlend;
        public float volume;
        public float pitch;
        public void PlayOneShot(AudioClip clip, float volumeScale) { }
    }

    public class Camera : Component
    {
        public static Camera main;
        public CameraClearFlags clearFlags;
        public float fieldOfView;
    }

    public enum CameraClearFlags { Skybox }

    public class Light : Component
    {
        public LightType type;
        public float intensity;
        public float range;
    }

    public enum LightType { Directional, Point }

    public static class LayerMask
    {
        public static int NameToLayer(string layerName) { return 0; }
    }

    public static class Physics
    {
        public static bool autoSimulation;
        public static bool autoSyncTransforms;
        public static Vector3 gravity;
        public static int defaultSolverIterations;
        public static int defaultSolverVelocityIterations;
        public static float defaultMaxDepenetrationVelocity;
        public static void SyncTransforms() { }
        public static void Simulate(float step) { }
    }

    public static class Time
    {
        public static float fixedDeltaTime;
        public static float maximumDeltaTime;
        public static float time;
    }

    public static class Application
    {
        public static string persistentDataPath = ".";
        public static string streamingAssetsPath = ".";
        public static string dataPath = ".";
        public static bool isPlaying;
        public static void Quit(int exitCode = 0) { }
    }

    public static class Input
    {
        public static bool GetKeyDown(KeyCode key) { return false; }
    }

    public enum KeyCode { R, Space, B, G, T, S, C, E }

    public static class Screen
    {
        public static int height;
    }

    public static class GUI
    {
        public static GUISkin skin = new GUISkin();
    }

    public class GUISkin
    {
        public GUIStyle box = new GUIStyle();
    }

    public class GUIStyle { }

    public static class GUILayout
    {
        public static void BeginArea(Rect rect, GUIStyle style) { }
        public static void EndArea() { }
        public static void Label(string text) { }
        public static void Space(float pixels) { }
        public static bool Button(string text) { return false; }
    }

    public static class Debug
    {
        public static void Log(string message) { }
        public static void LogError(object message) { }
    }
}

namespace UnityEditor
{
    using System;
    using UnityEngine;

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class MenuItemAttribute : Attribute
    {
        public MenuItemAttribute(string itemName) { }
    }

    public static class Selection
    {
        public static GameObject activeGameObject;
    }

    public static class EditorApplication
    {
        public static Action delayCall;
        public static void Exit(int exitCode) { }
        public static void EnterPlaymode() { }
    }
}

namespace UnityEditor.SceneManagement
{
    public enum NewSceneSetup { EmptyScene }
    public enum NewSceneMode { Single }

    public static class EditorSceneManager
    {
        public static object NewScene(NewSceneSetup setup, NewSceneMode mode) { return new object(); }
        public static bool SaveScene(object scene, string path) { return true; }
        public static object OpenScene(string path) { return new object(); }
    }
}
