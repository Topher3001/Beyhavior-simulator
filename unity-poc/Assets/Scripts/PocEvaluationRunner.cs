using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

namespace BeybladePhysicsPoc
{
    public sealed class PocEvaluationRunner : MonoBehaviour
    {
        private readonly List<TrialResult> results = new List<TrialResult>();

        public BeybladePocRunner Runner;
        public float TrialSeconds = 14f;
        public bool IsRunning { get; private set; }
        public string LastReportPath { get; private set; } = string.Empty;
        public string StatusLine { get; private set; } = "Evaluation: idle";
        private bool autoExitWhenDone;
        private string reportPathOverride = string.Empty;

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.E))
            {
                BeginEvaluation();
            }
        }

        public void BeginEvaluation()
        {
            if (IsRunning || Runner == null)
            {
                return;
            }

            StartCoroutine(RunTrials());
        }

        public void BeginEvaluationIfRequested()
        {
            var args = System.Environment.GetCommandLineArgs();
            if (!HasArg(args, "-beybladePocAutoEvaluate"))
            {
                return;
            }

            autoExitWhenDone = true;
            reportPathOverride = ValueAfter(args, "-beybladePocReportPath");

            var trialSecondsText = ValueAfter(args, "-beybladePocTrialSeconds");
            if (!string.IsNullOrEmpty(trialSecondsText))
            {
                float parsedSeconds;
                if (float.TryParse(trialSecondsText, NumberStyles.Float, CultureInfo.InvariantCulture, out parsedSeconds))
                {
                    TrialSeconds = Mathf.Clamp(parsedSeconds, 2f, 120f);
                }
            }

            BeginEvaluation();
        }

        private IEnumerator RunTrials()
        {
            IsRunning = true;
            results.Clear();
            LastReportPath = string.Empty;

            var trials = new[]
            {
                new TrialSpec("raw-physx", false, false),
                new TrialSpec("gyro-only", false, true),
                new TrialSpec("assisted-bowl-gyro", true, true)
            };

            for (var index = 0; index < trials.Length; index++)
            {
                var trial = trials[index];
                StatusLine = "Evaluation: " + trial.Name + " (" + (index + 1).ToString(CultureInfo.InvariantCulture) + "/" + trials.Length.ToString(CultureInfo.InvariantCulture) + ")";
                Runner.SetAssistMode(trial.BowlAssist, trial.GyroAssist);
                Runner.ResetAndLaunch();

                yield return new WaitForFixedUpdate();

                var metrics = new TrialMetrics(trial);
                var startTime = Time.time;
                while (Time.time - startTime < TrialSeconds)
                {
                    metrics.Sample(Runner, Time.time - startTime);
                    yield return new WaitForFixedUpdate();
                }

                metrics.Sample(Runner, Time.time - startTime);
                results.Add(metrics.ToResult());
            }

            LastReportPath = SaveJsonReport();
            StatusLine = "Evaluation: saved " + LastReportPath;
            IsRunning = false;
            if (autoExitWhenDone)
            {
#if UNITY_EDITOR
                EditorApplication.Exit(0);
#else
                Application.Quit(0);
#endif
            }
        }

        private string SaveJsonReport()
        {
            var path = reportPathOverride;
            if (string.IsNullOrEmpty(path))
            {
                var fileName = "beyblade-unity-poc-evaluation-" + System.DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".json";
                path = Path.Combine(Application.persistentDataPath, fileName);
            }

            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllText(path, BuildJsonReport(), Encoding.UTF8);
            return path;
        }

        private string BuildJsonReport()
        {
            var builder = new StringBuilder();
            builder.AppendLine("{");
            builder.AppendLine("  \"schema\": \"beyblade-simulator.unity-poc-evaluation.v1\",");
            builder.Append("  \"createdAt\": ").Append(JsonString(System.DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture))).AppendLine(",");
            builder.Append("  \"trialSeconds\": ").Append(Format(TrialSeconds)).AppendLine(",");
            builder.AppendLine("  \"physicsSettings\": {");
            builder.Append("    \"fixedDeltaTime\": ").Append(Format(Time.fixedDeltaTime)).AppendLine(",");
            builder.Append("    \"defaultSolverIterations\": ").Append(Physics.defaultSolverIterations.ToString(CultureInfo.InvariantCulture)).AppendLine(",");
            builder.Append("    \"defaultSolverVelocityIterations\": ").Append(Physics.defaultSolverVelocityIterations.ToString(CultureInfo.InvariantCulture)).AppendLine(",");
            builder.Append("    \"defaultMaxDepenetrationVelocity\": ").Append(Format(Physics.defaultMaxDepenetrationVelocity)).AppendLine();
            builder.AppendLine("  },");
            builder.AppendLine("  \"trials\": [");

            for (var i = 0; i < results.Count; i++)
            {
                AppendTrial(builder, results[i], i == results.Count - 1);
            }

            builder.AppendLine("  ]");
            builder.AppendLine("}");
            return builder.ToString();
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

        private static bool HasArg(string[] args, string name)
        {
            for (var i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], name, System.StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        private static string ValueAfter(string[] args, string name)
        {
            for (var i = 0; i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], name, System.StringComparison.OrdinalIgnoreCase))
                {
                    return args[i + 1];
                }
            }

            return string.Empty;
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
            public int TotalCollisions { get; private set; }

            public void Sample(BeybladePocRunner runner, float elapsedSeconds)
            {
                if (runner == null || runner.Tops == null)
                {
                    return;
                }

                lastDuration = elapsedSeconds;
                var tops = runner.Tops;
                if (tops.Count >= 2 && tops[0] != null && tops[1] != null)
                {
                    MinTopDistance = Mathf.Min(MinTopDistance, Vector3.Distance(tops[0].transform.position, tops[1].transform.position));
                }

                TotalCollisions = 0;
                for (var i = 0; i < tops.Count; i++)
                {
                    var top = tops[i];
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
                    TotalCollisions += top.CollisionCount;
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

                    if (i == 0)
                    {
                        leftEndRpm = top.CurrentSpinRpm;
                        leftEndSpeed = top.CurrentSpeed;
                    }
                    else if (i == 1)
                    {
                        rightEndRpm = top.CurrentSpinRpm;
                        rightEndSpeed = top.CurrentSpeed;
                    }
                }
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
                    TotalCollisions = TotalCollisions,
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
