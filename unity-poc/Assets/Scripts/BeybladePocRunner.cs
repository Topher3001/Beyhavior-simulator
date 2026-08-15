using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace BeybladePhysicsPoc
{
    public sealed class BeybladePocRunner : MonoBehaviour
    {
        private readonly List<BeybladeTopController> tops = new List<BeybladeTopController>();
        private readonly List<string> visualModelMessages = new List<string>();
        private StadiumBowl stadium;
        private Material redMaterial;
        private Material blueMaterial;
        private Material metalMaterial;
        private Material tipMaterial;
        private AudioClip dingClip;
        private PocTelemetryRecorder recorder;
        private PocEvaluationRunner evaluator;
        private bool bowlAssist = true;
        private bool gyroAssist = true;
        private bool launched;

        public IReadOnlyList<BeybladeTopController> Tops { get { return tops; } }
        public StadiumBowl Stadium { get { return stadium; } }
        public PocTelemetryRecorder Recorder { get { return recorder; } }
        public bool BowlAssistEnabled { get { return bowlAssist; } }
        public bool GyroAssistEnabled { get { return gyroAssist; } }

        private void Awake()
        {
            InitializePoc();
        }

        public void InitializePoc()
        {
            Physics.autoSimulation = true;
            Physics.autoSyncTransforms = false;
            Physics.gravity = new Vector3(0f, -9.81f, 0f);
            Physics.defaultSolverIterations = 16;
            Physics.defaultSolverVelocityIterations = 8;
            Physics.defaultMaxDepenetrationVelocity = 2.4f;
            Time.fixedDeltaTime = 1f / 120f;
            Time.maximumDeltaTime = 1f / 8f;

            CreateMaterials();
            dingClip = CreateDingClip();
            if (recorder == null)
            {
                recorder = gameObject.GetComponent<PocTelemetryRecorder>();
                if (recorder == null)
                {
                    recorder = gameObject.AddComponent<PocTelemetryRecorder>();
                }
            }

            if (evaluator == null)
            {
                evaluator = gameObject.GetComponent<PocEvaluationRunner>();
                if (evaluator == null)
                {
                    evaluator = gameObject.AddComponent<PocEvaluationRunner>();
                }
            }

            evaluator.Runner = this;
        }

        private void Start()
        {
            BuildPocScene(true);
            Launch();
            if (evaluator != null)
            {
                evaluator.BeginEvaluationIfRequested();
            }
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.R))
            {
                ResetTops();
            }

            if (Input.GetKeyDown(KeyCode.Space))
            {
                Launch();
            }

            if (Input.GetKeyDown(KeyCode.B))
            {
                bowlAssist = !bowlAssist;
                ApplyAssistFlags();
            }

            if (Input.GetKeyDown(KeyCode.G))
            {
                gyroAssist = !gyroAssist;
                ApplyAssistFlags();
            }

            if (Input.GetKeyDown(KeyCode.T))
            {
                if (recorder == null)
                {
                    return;
                }

                if (recorder.IsRecording)
                {
                    recorder.StopRecording();
                }
                else
                {
                    recorder.StartRecording();
                }
            }

            if (Input.GetKeyDown(KeyCode.S))
            {
                if (recorder != null)
                {
                    recorder.SaveCsv();
                }
            }

            if (Input.GetKeyDown(KeyCode.C))
            {
                ResetCamera();
            }
        }

        private void OnGUI()
        {
            const int width = 360;
            GUILayout.BeginArea(new Rect(16, 16, width, Screen.height - 32), GUI.skin.box);
            GUILayout.Label("Beyblade Unity Physics POC");
            GUILayout.Label("A hobby experiment by Ben, Chris and Jason");
            GUILayout.Space(8);

            if (GUILayout.Button(launched ? "Reset And Relaunch (R)" : "Launch (Space)"))
            {
                if (launched)
                {
                    ResetTops();
                }

                Launch();
            }

            if (GUILayout.Button(bowlAssist ? "Bowl Assist: On (B)" : "Bowl Assist: Off (B)"))
            {
                bowlAssist = !bowlAssist;
                ApplyAssistFlags();
            }

            if (GUILayout.Button(gyroAssist ? "Gyro Assist: On (G)" : "Gyro Assist: Off (G)"))
            {
                gyroAssist = !gyroAssist;
                ApplyAssistFlags();
            }

            if (GUILayout.Button(recorder != null && recorder.IsRecording ? "Stop Telemetry (T)" : "Start Telemetry (T)"))
            {
                if (recorder != null && recorder.IsRecording)
                {
                    recorder.StopRecording();
                }
                else if (recorder != null)
                {
                    recorder.StartRecording();
                }
            }

            if (GUILayout.Button("Save Telemetry CSV (S)"))
            {
                if (recorder != null)
                {
                    recorder.SaveCsv();
                }
            }

            if (GUILayout.Button(evaluator != null && evaluator.IsRunning ? "Evaluation Running..." : "Run Evaluation (E)"))
            {
                if (evaluator != null)
                {
                    evaluator.BeginEvaluation();
                }
            }

            GUILayout.Label("Camera reset: C");
            if (recorder != null && !string.IsNullOrEmpty(recorder.LastSavedPath))
            {
                GUILayout.Label("Saved: " + recorder.LastSavedPath);
            }

            if (evaluator != null && !string.IsNullOrEmpty(evaluator.LastReportPath))
            {
                GUILayout.Label("Evaluation: " + evaluator.LastReportPath);
            }
            GUILayout.Space(10);

            foreach (var top in tops)
            {
                GUILayout.Label(top.TelemetryLine);
            }

            foreach (var message in visualModelMessages)
            {
                GUILayout.Label(message);
            }

            GUILayout.Space(10);
            GUILayout.Label(recorder != null ? recorder.SummaryLine : "Telemetry: unavailable");
            if (evaluator != null)
            {
                GUILayout.Label(evaluator.StatusLine);
            }
            GUILayout.Space(10);
            GUILayout.Label("Evaluate: rim behavior, center contact, bounce, wall stability, and spin decay.");
            GUILayout.EndArea();
        }

        public void BuildPocScene(bool includeCameraAndLights)
        {
            InitializePoc();
            if (includeCameraAndLights)
            {
                CreateCamera();
                CreateLights();
            }

            var stadiumObject = new GameObject("BX-10 Style Bowl Stadium");
            stadium = stadiumObject.AddComponent<StadiumBowl>();
            stadium.Build(CreateMaterial("Bowl", new Color(0.82f, 0.89f, 0.9f), 0.18f, 0.08f), CreateMaterial("Rim", new Color(0.92f, 0.95f, 0.96f), 0.12f, 0.08f));

            ResetTops();
        }

        public void ResetTops()
        {
            foreach (var top in tops)
            {
                if (top != null)
                {
                    DestroyPocObject(top.gameObject);
                }
            }

            tops.Clear();
            visualModelMessages.Clear();
            launched = false;

            tops.Add(CreateTop("Left Attack", redMaterial, new Vector3(-2.25f, 1.1f, 0.5f), new Vector3(1.35f, 0f, 0.28f), 8200f, 0.55f));
            tops.Add(CreateTop("Right Stamina", blueMaterial, new Vector3(2.25f, 1.1f, -0.5f), new Vector3(-1.08f, 0f, -0.18f), 7600f, 0.34f));
            ApplyAssistFlags();
            if (recorder != null)
            {
                recorder.SetTops(tops);
                recorder.StartRecording();
            }
        }

        public void Launch()
        {
            foreach (var top in tops)
            {
                top.Launch();
            }

            if (recorder != null)
            {
                recorder.StartRecording();
            }
            launched = true;
        }

        public void ResetAndLaunch()
        {
            ResetTops();
            Launch();
        }

        public void SetAssistMode(bool useBowlAssist, bool useGyroAssist)
        {
            bowlAssist = useBowlAssist;
            gyroAssist = useGyroAssist;
            ApplyAssistFlags();
        }

        private void ResetCamera()
        {
            var mainCamera = Camera.main;
            if (mainCamera == null)
            {
                return;
            }

            mainCamera.transform.position = new Vector3(0f, 8.2f, -8.6f);
            mainCamera.transform.LookAt(Vector3.zero + Vector3.up * 0.45f);
        }

        private void ApplyAssistFlags()
        {
            foreach (var top in tops)
            {
                if (top == null)
                {
                    continue;
                }

                top.UseAnalyticBowlAssist = bowlAssist;
                top.UseGyroAssist = gyroAssist;
            }
        }

        private BeybladeTopController CreateTop(string label, Material ringMaterial, Vector3 position, Vector3 launchVelocity, float launchRpm, float traction)
        {
            var root = new GameObject(label);
            root.layer = LayerMask.NameToLayer("Bey");
            root.transform.position = position;

            var body = root.AddComponent<Rigidbody>();
            body.mass = 0.043f;
            body.linearDamping = 0.015f;
            body.angularDamping = 0.006f;
            body.maxAngularVelocity = 1400f;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.solverIterations = 24;
            body.solverVelocityIterations = 10;
            body.centerOfMass = new Vector3(0f, 0.22f, 0f);

            var visualRoot = new GameObject("Visual Model");
            visualRoot.layer = LayerMask.NameToLayer("Bey");
            visualRoot.transform.SetParent(root.transform, false);

            if (!TryAttachStreamingStlVisual(label, visualRoot.transform, ringMaterial))
            {
                CreateVisualCylinder(visualRoot.transform, "Energy Ring", ringMaterial, new Vector3(0f, 0.34f, 0f), 1.0f, 0.24f);
                CreateVisualCylinder(visualRoot.transform, "Metal Core", metalMaterial, new Vector3(0f, 0.18f, 0f), 0.72f, 0.28f);
                CreateVisualSphere(visualRoot.transform, "Performance Tip", tipMaterial, new Vector3(0f, -0.08f, 0f), 0.18f);
            }

            CreateCompoundColliders(root.transform, CreateTopPhysicMaterial(label, traction));

            var audioSource = root.AddComponent<AudioSource>();
            audioSource.playOnAwake = false;
            audioSource.spatialBlend = 0.65f;
            audioSource.volume = 0.55f;

            var top = root.AddComponent<BeybladeTopController>();
            top.Label = label;
            top.Body = body;
            top.Stadium = stadium;
            top.LaunchVelocity = launchVelocity;
            top.LaunchRpm = launchRpm;
            top.Traction = traction;
            top.UseAnalyticBowlAssist = bowlAssist;
            top.UseGyroAssist = gyroAssist;
            top.DingClip = dingClip;
            top.Audio = audioSource;
            top.SetLaunchPose(root.transform.position, root.transform.rotation);

            return top;
        }

        private bool TryAttachStreamingStlVisual(string label, Transform visualRoot, Material material)
        {
            var fileName = label.StartsWith("Left") ? "left.stl" : "right.stl";
            var path = Path.Combine(Application.streamingAssetsPath, "BeybladePoc", fileName);
            if (!File.Exists(path))
            {
                visualModelMessages.Add(label + ": procedural visual");
                return false;
            }

            Mesh mesh;
            string errorMessage;
            if (!SimpleStlMeshLoader.TryLoad(path, out mesh, out errorMessage))
            {
                visualModelMessages.Add(label + ": STL failed, using procedural visual (" + errorMessage + ")");
                return false;
            }

            var visual = new GameObject("Imported STL Visual");
            visual.layer = LayerMask.NameToLayer("Bey");
            visual.transform.SetParent(visualRoot, false);
            visual.AddComponent<MeshFilter>().sharedMesh = mesh;
            visual.AddComponent<MeshRenderer>().sharedMaterial = material;
            FitVisualMeshToProxy(visual.transform, mesh);
            visualModelMessages.Add(label + ": " + fileName + " visual-only STL");
            return true;
        }

        private void FitVisualMeshToProxy(Transform visual, Mesh mesh)
        {
            var bounds = mesh.bounds;
            var horizontalDiameter = Mathf.Max(bounds.size.x, bounds.size.z);
            if (horizontalDiameter <= 0.001f)
            {
                return;
            }

            const float targetDiameter = 1.12f;
            const float targetBottomY = -0.25f;
            var scale = targetDiameter / horizontalDiameter;
            visual.localScale = Vector3.one * scale;
            visual.localPosition = new Vector3(
                -bounds.center.x * scale,
                targetBottomY - bounds.min.y * scale,
                -bounds.center.z * scale);
            visual.localRotation = Quaternion.identity;
        }

        private void CreateCompoundColliders(Transform root, PhysicsMaterial physicsMaterial)
        {
            var tip = new GameObject("Tip Collider");
            tip.transform.SetParent(root, false);
            tip.transform.localPosition = new Vector3(0f, -0.08f, 0f);
            var tipCollider = tip.AddComponent<SphereCollider>();
            tipCollider.radius = 0.17f;
            tipCollider.sharedMaterial = physicsMaterial;

            const int ringSegments = 12;
            for (var i = 0; i < ringSegments; i++)
            {
                var angle = (Mathf.PI * 2f * i) / ringSegments;
                var segment = new GameObject("Ring Collider");
                segment.transform.SetParent(root, false);
                segment.transform.localPosition = new Vector3(Mathf.Cos(angle) * 0.56f, 0.28f, Mathf.Sin(angle) * 0.56f);
                segment.transform.localRotation = Quaternion.Euler(0f, -angle * Mathf.Rad2Deg, 0f);
                var box = segment.AddComponent<BoxCollider>();
                box.size = new Vector3(0.34f, 0.22f, 0.18f);
                box.sharedMaterial = physicsMaterial;
            }

            const int coreSegments = 8;
            for (var i = 0; i < coreSegments; i++)
            {
                var angle = (Mathf.PI * 2f * i) / coreSegments;
                var segment = new GameObject("Core Collider");
                segment.transform.SetParent(root, false);
                segment.transform.localPosition = new Vector3(Mathf.Cos(angle) * 0.24f, 0.14f, Mathf.Sin(angle) * 0.24f);
                segment.transform.localRotation = Quaternion.Euler(0f, -angle * Mathf.Rad2Deg, 0f);
                var box = segment.AddComponent<BoxCollider>();
                box.size = new Vector3(0.34f, 0.24f, 0.24f);
                box.sharedMaterial = physicsMaterial;
            }
        }

        private void CreateVisualCylinder(Transform parent, string name, Material material, Vector3 localPosition, float diameter, float height)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            visual.name = name;
            visual.layer = LayerMask.NameToLayer("Bey");
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = localPosition;
            visual.transform.localScale = new Vector3(diameter, height / 2f, diameter);
            visual.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(visual.GetComponent<Collider>());
        }

        private void CreateVisualSphere(Transform parent, string name, Material material, Vector3 localPosition, float radius)
        {
            var visual = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            visual.name = name;
            visual.layer = LayerMask.NameToLayer("Bey");
            visual.transform.SetParent(parent, false);
            visual.transform.localPosition = localPosition;
            visual.transform.localScale = Vector3.one * radius * 2f;
            visual.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(visual.GetComponent<Collider>());
        }

        private void CreateCamera()
        {
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.Skybox;
            camera.fieldOfView = 48f;
            camera.transform.position = new Vector3(0f, 8.2f, -8.6f);
            camera.transform.LookAt(Vector3.zero + Vector3.up * 0.45f);
        }

        private void CreateLights()
        {
            var sun = new GameObject("Key Light");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            sun.transform.rotation = Quaternion.Euler(48f, -36f, 0f);

            var fill = new GameObject("Fill Light");
            var fillLight = fill.AddComponent<Light>();
            fillLight.type = LightType.Point;
            fillLight.intensity = 1.5f;
            fillLight.range = 14f;
            fill.transform.position = new Vector3(-3f, 5f, -4f);
        }

        private void CreateMaterials()
        {
            redMaterial = CreateMaterial("Red Attack", new Color(0.92f, 0.16f, 0.12f), 0.45f, 0.18f);
            blueMaterial = CreateMaterial("Blue Stamina", new Color(0.08f, 0.36f, 0.9f), 0.42f, 0.16f);
            metalMaterial = CreateMaterial("Metal Core", new Color(0.72f, 0.74f, 0.76f), 0.75f, 0.12f);
            tipMaterial = CreateMaterial("Dark Tip", new Color(0.06f, 0.07f, 0.08f), 0.3f, 0.08f);
        }

        private Material CreateMaterial(string name, Color color, float metallic, float smoothness)
        {
            var material = new Material(Shader.Find("Standard"));
            material.name = name;
            material.color = color;
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Glossiness", smoothness);

            return material;
        }

        private PhysicsMaterial CreateTopPhysicMaterial(string label, float traction)
        {
            return new PhysicsMaterial(label + " Contact")
            {
                dynamicFriction = Mathf.Clamp(traction, 0.08f, 0.95f),
                staticFriction = Mathf.Clamp(traction * 1.18f, 0.08f, 1.1f),
                bounciness = 0.025f,
                frictionCombine = PhysicsMaterialCombine.Average,
                bounceCombine = PhysicsMaterialCombine.Minimum
            };
        }

        private AudioClip CreateDingClip()
        {
            const int sampleRate = 44100;
            const float duration = 0.18f;
            var samples = Mathf.CeilToInt(sampleRate * duration);
            var data = new float[samples];

            for (var i = 0; i < samples; i++)
            {
                var time = i / (float)sampleRate;
                var envelope = Mathf.Exp(-time * 18f);
                var tone = Mathf.Sin(2f * Mathf.PI * 1260f * time) * 0.55f + Mathf.Sin(2f * Mathf.PI * 1880f * time) * 0.28f;
                data[i] = tone * envelope;
            }

            var clip = AudioClip.Create("Procedural Metal Ding", samples, 1, sampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }

        private void DestroyPocObject(GameObject target)
        {
            if (target == null)
            {
                return;
            }

            if (Application.isPlaying)
            {
                Destroy(target);
            }
            else
            {
                DestroyImmediate(target);
            }
        }
    }
}
