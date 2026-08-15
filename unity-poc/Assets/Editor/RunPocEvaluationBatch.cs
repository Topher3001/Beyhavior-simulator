#if UNITY_EDITOR
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BeybladePhysicsPoc.Editor
{
    public static class RunPocEvaluationBatch
    {
        private const string SceneFolder = "Assets/Scenes";
        private const string ScenePath = "Assets/Scenes/BeybladeUnityPhysicsPoc.unity";
        private const float FixedStepSeconds = 1f / 120f;

        public static void Run()
        {
            try
            {
                var args = System.Environment.GetCommandLineArgs();
                var reportPath = ValueAfter(args, "-beybladePocReportPath");
                if (string.IsNullOrEmpty(reportPath))
                {
                    reportPath = Path.Combine(Application.dataPath, "..", "EvaluationReports", "beyblade-unity-poc-evaluation.json");
                }

                var trialSeconds = ParseTrialSeconds(ValueAfter(args, "-beybladePocTrialSeconds"));
                var report = RunHeadlessEvaluation(trialSeconds);
                WriteReport(reportPath, trialSeconds, report);
                Debug.Log("Beyblade Unity POC batch evaluation report written to " + reportPath);
                EditorApplication.Exit(0);
            }
            catch (System.Exception exception)
            {
                Debug.LogError(exception);
                EditorApplication.Exit(1);
            }
        }

        private static List<TrialResult> RunHeadlessEvaluation(float trialSeconds)
        {
            if (!Directory.Exists(SceneFolder))
            {
                Directory.CreateDirectory(SceneFolder);
            }

            Physics.autoSimulation = false;
            Physics.autoSyncTransforms = false;
            Physics.gravity = new Vector3(0f, -9.81f, 0f);
            Physics.defaultSolverIterations = 16;
            Physics.defaultSolverVelocityIterations = 8;
            Physics.defaultMaxDepenetrationVelocity = 2.4f;
            Time.fixedDeltaTime = FixedStepSeconds;

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var runnerObject = new GameObject("Beyblade Unity Physics POC Batch");
            var runner = runnerObject.AddComponent<BeybladePocRunner>();
            runner.InitializePoc();
            runner.BuildPocScene(false);
            EditorSceneManager.SaveScene(scene, ScenePath);

            var results = new List<TrialResult>();
            var trials = new[]
            {
                new TrialSpec("raw-physx", false, false),
                new TrialSpec("gyro-only", false, true),
                new TrialSpec("assisted-bowl-gyro", true, true)
            };

            foreach (var trial in trials)
            {
                runner.SetAssistMode(trial.BowlAssist, trial.GyroAssist);
                runner.ResetAndLaunch();
                Physics.SyncTransforms();
                results.Add(RunTrial(runner, trial, trialSeconds));
            }

            return results;
        }

        private static TrialResult RunTrial(BeybladePocRunner runner, TrialSpec spec, float trialSeconds)
        {
            var metrics = new TrialMetrics(spec);
            var steps = Mathf.CeilToInt(trialSeconds / FixedStepSeconds);
            var wasInBeyContact = false;

            for (var step = 0; step <= steps; step++)
            {
                var elapsed = step * FixedStepSeconds;
                foreach (var top in runner.Tops)
                {
                    if (top != null)
                    {
                        top.StepForSimulation(FixedStepSeconds);
                    }
                }

                Physics.Simulate(FixedStepSeconds);
                Physics.SyncTransforms();

                var inBeyContact = metrics.Sample(runner, elapsed);
                if (inBeyContact && !wasInBeyContact)
                {
                    metrics.ProximityContactEvents += 1;
                }

                wasInBeyContact = inBeyContact;
            }

            return metrics.ToResult();
        }

        private static void WriteReport(string reportPath, float trialSeconds, List<TrialResult> results)
        {
            var fullPath = Path.GetFullPath(reportPath);
            var directory = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var builder = new StringBuilder();
            builder.AppendLine("{");
            builder.AppendLine("  \"schema\": \"beyblade-simulator.unity-poc-evaluation.v1\",");
            builder.Append("  \"createdAt\": ").Append(JsonString(System.DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture))).AppendLine(",");
            builder.Append("  \"trialSeconds\": ").Append(Format(trialSeconds)).AppendLine(",");
            builder.AppendLine("  \"mode\": \"editor-headless-physics-simulate\",");
            builder.AppendLine("  \"physicsSettings\": {");
            builder.Append("    \"fixedDeltaTime\": ").Append(Format(FixedStepSeconds)).AppendLine(",");
            builder.Append("    \"defaultSolverIterations\": ").Append(Physics.defaultSolverIterations.ToString(CultureInfo.InvariantCulture)).AppendLine(",");
            builder.Append("    \"defaultSolverVelocityIterations\": ").Append(Physics.defaultSolverVelocityIterations.ToString(CultureInfo.InvariantCulture)).AppendLine(",");
            builder.Append("    \"defaultMaxDepenetrationVelocity\": ").Append(Format(Physics.defaultMaxDepenetrationVelocity)).AppendLine();
            builder.AppendLine("  },");
            builder.AppendLine("  \"trials\": [");

            for (var index = 0; index < results.Count; index++)
            {
                AppendTrial(builder, results[index], index == results.Count - 1);
            }

            builder.AppendLine("  ]");
            builder.AppendLine("}");
            File.WriteAllText(fullPath, builder.ToString(), Encoding.UTF8);
        }

        private static void AppendTrial(StringBuilder builder, TrialResult result, bool isLast)
        {
            builder.AppendLine("    {");
            builder.Append("      \"name\": ").Append(JsonString(result.Name)).AppendLine(",");
            builder.Append("      \"bowlAssist\": ").Append(result.BowlAssist ? "true" : "false").AppendLine(",");
            builder.Append("      \"gyroAssist\": ").Append(result.GyroAssist ? "true" : "false").AppendLine(",");
            builder.Append("      \"durationSeconds\": ").Append(Format(result.DurationSeconds)).AppendLine(",");
            builder.Append("      \"sampleCount\": ").Append(result.SampleCount.ToString(CultureInfo.InvariantCulture)).AppendLine(",");
            builder.Append("      \"maxHeightAboveSurface\": ").Append(Format(result.MaxHeightAboveSurface)).AppendLine(",");
            builder.Append("      \"maxRadius\": ").Append(Format(result.MaxRadius)).AppendLine(",");
            builder.Append("      \"maxTiltDegrees\": ").Append(Format(result.MaxTiltDegrees)).AppendLine(",");
            builder.Append("      \"minTopDistance\": ").Append(Format(result.MinTopDistance)).AppendLine(",");
            builder.Append("      \"totalCollisions\": ").Append(result.TotalCollisions.ToString(CultureInfo.InvariantCulture)).AppendLine(",");
            builder.Append("      \"rimSampleRatio\": ").Append(Format(result.RimSampleRatio)).AppendLine(",");
            builder.Append("      \"centerContactSampleRatio\": ").Append(Format(result.CenterContactSampleRatio)).AppendLine(",");
            builder.Append("      \"bounceRiskSampleRatio\": ").Append(Format(result.BounceRiskSampleRatio)).AppendLine(",");
            builder.AppendLine("      \"endState\": {");
            builder.Append("        \"leftRpm\": ").Append(Format(result.LeftEndRpm)).AppendLine(",");
            builder.Append("        \"rightRpm\": ").Append(Format(result.RightEndRpm)).AppendLine(",");
            builder.Append("        \"leftSpeed\": ").Append(Format(result.LeftEndSpeed)).AppendLine(",");
            builder.Append("        \"rightSpeed\": ").Append(Format(result.RightEndSpeed)).AppendLine();
            builder.AppendLine("      }");
            builder.Append("    }");
            builder.AppendLine(isLast ? string.Empty : ",");
        }

        private static float ParseTrialSeconds(string value)
        {
            float parsed;
            if (!string.IsNullOrEmpty(value) && float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out parsed))
            {
                return Mathf.Clamp(parsed, 2f, 120f);
            }

            return 14f;
        }

        private static string ValueAfter(string[] args, string name)
        {
            for (var index = 0; index < args.Length - 1; index++)
            {
                if (string.Equals(args[index], name, System.StringComparison.OrdinalIgnoreCase))
                {
                    return args[index + 1];
                }
            }

            return string.Empty;
        }

        private static string JsonString(string value)
        {
            return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
        }

        private static string Format(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                return "0";
            }

            return value.ToString("0.####", CultureInfo.InvariantCulture);
        }

        private readonly struct TrialSpec
        {
            public TrialSpec(string name, bool bowlAssist, bool gyroAssist)
            {
                Name = name;
                BowlAssist = bowlAssist;
                GyroAssist = gyroAssist;
            }

            public readonly string Name;
            public readonly bool BowlAssist;
            public readonly bool GyroAssist;
        }

        private sealed class TrialMetrics
        {
            private readonly TrialSpec spec;
            private int rimSamples;
            private int centerContactSamples;
            private int bounceRiskSamples;
            private int totalPerTopSamples;
            private float lastDuration;
            private float leftEndRpm;
            private float rightEndRpm;
            private float leftEndSpeed;
            private float rightEndSpeed;

            public TrialMetrics(TrialSpec spec)
            {
                this.spec = spec;
                MaxHeightAboveSurface = 0f;
                MaxRadius = 0f;
                MaxTiltDegrees = 0f;
                MinTopDistance = float.PositiveInfinity;
            }

            public float MaxHeightAboveSurface { get; private set; }
            public float MaxRadius { get; private set; }
            public float MaxTiltDegrees { get; private set; }
            public float MinTopDistance { get; private set; }
            public int ProximityContactEvents { get; set; }

            public bool Sample(BeybladePocRunner runner, float elapsedSeconds)
            {
                if (runner == null || runner.Tops == null)
                {
                    return false;
                }

                lastDuration = elapsedSeconds;
                var tops = runner.Tops;
                var inBeyContact = false;
                if (tops.Count >= 2 && tops[0] != null && tops[1] != null)
                {
                    var topDistance = Vector3.Distance(tops[0].transform.position, tops[1].transform.position);
                    MinTopDistance = Mathf.Min(MinTopDistance, topDistance);
                    inBeyContact = topDistance < 1.18f;
                }

                for (var index = 0; index < tops.Count; index++)
                {
                    var top = tops[index];
                    if (top == null)
                    {
                        continue;
                    }

                    var radius = top.CurrentRadius;
                    var tilt = top.CurrentTiltDegrees;
                    var surfaceY = runner.Stadium != null ? runner.Stadium.SurfaceY(top.transform.position) : 0f;
                    var heightAboveSurface = top.transform.position.y - surfaceY;

                    MaxRadius = Mathf.Max(MaxRadius, radius);
                    MaxTiltDegrees = Mathf.Max(MaxTiltDegrees, tilt);
                    MaxHeightAboveSurface = Mathf.Max(MaxHeightAboveSurface, heightAboveSurface);
                    totalPerTopSamples += 1;

                    if (radius > 4.85f)
                    {
                        rimSamples += 1;
                    }

                    if (radius < 1.35f)
                    {
                        centerContactSamples += 1;
                    }

                    if (heightAboveSurface > 0.95f)
                    {
                        bounceRiskSamples += 1;
                    }

                    if (index == 0)
                    {
                        leftEndRpm = top.CurrentSpinRpm;
                        leftEndSpeed = top.CurrentSpeed;
                    }
                    else if (index == 1)
                    {
                        rightEndRpm = top.CurrentSpinRpm;
                        rightEndSpeed = top.CurrentSpeed;
                    }
                }

                return inBeyContact;
            }

            public TrialResult ToResult()
            {
                return new TrialResult
                {
                    Name = spec.Name,
                    BowlAssist = spec.BowlAssist,
                    GyroAssist = spec.GyroAssist,
                    DurationSeconds = lastDuration,
                    SampleCount = totalPerTopSamples,
                    MaxHeightAboveSurface = MaxHeightAboveSurface,
                    MaxRadius = MaxRadius,
                    MaxTiltDegrees = MaxTiltDegrees,
                    MinTopDistance = float.IsPositiveInfinity(MinTopDistance) ? 0f : MinTopDistance,
                    TotalCollisions = ProximityContactEvents,
                    RimSampleRatio = Ratio(rimSamples, totalPerTopSamples),
                    CenterContactSampleRatio = Ratio(centerContactSamples, totalPerTopSamples),
                    BounceRiskSampleRatio = Ratio(bounceRiskSamples, totalPerTopSamples),
                    LeftEndRpm = leftEndRpm,
                    RightEndRpm = rightEndRpm,
                    LeftEndSpeed = leftEndSpeed,
                    RightEndSpeed = rightEndSpeed
                };
            }

            private static float Ratio(int part, int whole)
            {
                if (whole <= 0)
                {
                    return 0f;
                }

                return part / (float)whole;
            }
        }

        private struct TrialResult
        {
            public string Name;
            public bool BowlAssist;
            public bool GyroAssist;
            public float DurationSeconds;
            public int SampleCount;
            public float MaxHeightAboveSurface;
            public float MaxRadius;
            public float MaxTiltDegrees;
            public float MinTopDistance;
            public int TotalCollisions;
            public float RimSampleRatio;
            public float CenterContactSampleRatio;
            public float BounceRiskSampleRatio;
            public float LeftEndRpm;
            public float RightEndRpm;
            public float LeftEndSpeed;
            public float RightEndSpeed;
        }
    }
}
#endif
