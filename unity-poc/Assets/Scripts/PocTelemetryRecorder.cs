using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEngine;

namespace BeybladePhysicsPoc
{
    public sealed class PocTelemetryRecorder : MonoBehaviour
    {
        private readonly List<BeybladeTopController> tops = new List<BeybladeTopController>();
        private readonly List<Sample> samples = new List<Sample>();
        private float nextSampleTime;
        private float runStartTime;
        private float minTopDistance = float.PositiveInfinity;
        private float maxRadius;
        private int rimSampleCount;

        public bool IsRecording { get; private set; }
        public float SampleRateHz = 30f;
        public float RimRadiusThreshold = 4.85f;
        public string LastSavedPath { get; private set; } = string.Empty;

        public string SummaryLine
        {
            get
            {
                if (samples.Count == 0)
                {
                    return "Telemetry: no samples yet";
                }

                var duration = Mathf.Max(0f, Time.time - runStartTime);
                var minDistanceText = float.IsPositiveInfinity(minTopDistance) ? "n/a" : minTopDistance.ToString("0.00", CultureInfo.InvariantCulture);
                return $"Telemetry: {samples.Count} samples | {duration:0.0}s | closest {minDistanceText} | max radius {maxRadius:0.00} | rim samples {rimSampleCount}";
            }
        }

        public void SetTops(IEnumerable<BeybladeTopController> sourceTops)
        {
            tops.Clear();
            foreach (var top in sourceTops)
            {
                if (top != null)
                {
                    tops.Add(top);
                }
            }
        }

        public void StartRecording()
        {
            samples.Clear();
            minTopDistance = float.PositiveInfinity;
            maxRadius = 0f;
            rimSampleCount = 0;
            runStartTime = Time.time;
            nextSampleTime = Time.time;
            LastSavedPath = string.Empty;
            IsRecording = true;
        }

        public void StopRecording()
        {
            IsRecording = false;
        }

        public string SaveCsv()
        {
            if (samples.Count == 0)
            {
                return string.Empty;
            }

            var fileName = "beyblade-unity-poc-" + System.DateTime.Now.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".csv";
            var path = Path.Combine(Application.persistentDataPath, fileName);
            var builder = new StringBuilder();
            builder.AppendLine("time,label,rpm,tiltDegrees,speed,radius,x,y,z,collisions,bowlAssist,gyroAssist");

            foreach (var sample in samples)
            {
                builder.Append(sample.Time.ToString("0.000", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(EscapeCsv(sample.Label)).Append(',');
                builder.Append(sample.Rpm.ToString("0.0", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.TiltDegrees.ToString("0.00", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.Speed.ToString("0.000", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.Radius.ToString("0.000", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.Position.x.ToString("0.000", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.Position.y.ToString("0.000", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.Position.z.ToString("0.000", CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.CollisionCount.ToString(CultureInfo.InvariantCulture)).Append(',');
                builder.Append(sample.BowlAssist ? "1" : "0").Append(',');
                builder.Append(sample.GyroAssist ? "1" : "0").AppendLine();
            }

            Directory.CreateDirectory(Application.persistentDataPath);
            File.WriteAllText(path, builder.ToString());
            LastSavedPath = path;
            return path;
        }

        private void FixedUpdate()
        {
            if (!IsRecording || Time.time < nextSampleTime)
            {
                return;
            }

            CaptureSample();
            nextSampleTime = Time.time + 1f / Mathf.Max(SampleRateHz, 1f);
        }

        private void CaptureSample()
        {
            if (tops.Count >= 2 && tops[0] != null && tops[1] != null)
            {
                minTopDistance = Mathf.Min(minTopDistance, Vector3.Distance(tops[0].transform.position, tops[1].transform.position));
            }

            foreach (var top in tops)
            {
                if (top == null)
                {
                    continue;
                }

                var radius = top.CurrentRadius;
                maxRadius = Mathf.Max(maxRadius, radius);
                if (radius > RimRadiusThreshold)
                {
                    rimSampleCount += 1;
                }

                samples.Add(new Sample
                {
                    Time = Time.time - runStartTime,
                    Label = top.Label,
                    Rpm = top.CurrentSpinRpm,
                    TiltDegrees = top.CurrentTiltDegrees,
                    Speed = top.CurrentSpeed,
                    Radius = radius,
                    Position = top.transform.position,
                    CollisionCount = top.CollisionCount,
                    BowlAssist = top.UseAnalyticBowlAssist,
                    GyroAssist = top.UseGyroAssist
                });
            }
        }

        private static string EscapeCsv(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            if (value.IndexOfAny(new[] { ',', '"', '\n', '\r' }) < 0)
            {
                return value;
            }

            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }

        private struct Sample
        {
            public float Time;
            public string Label;
            public float Rpm;
            public float TiltDegrees;
            public float Speed;
            public float Radius;
            public Vector3 Position;
            public int CollisionCount;
            public bool BowlAssist;
            public bool GyroAssist;
        }
    }
}
