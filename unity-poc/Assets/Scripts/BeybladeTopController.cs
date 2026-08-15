using UnityEngine;

namespace BeybladePhysicsPoc
{
    public sealed class BeybladeTopController : MonoBehaviour
    {
        public string Label;
        public Rigidbody Body;
        public StadiumBowl Stadium;
        public Vector3 LaunchVelocity;
        public float LaunchRpm = 8000f;
        public float Traction = 0.42f;
        public bool UseAnalyticBowlAssist = true;
        public bool UseGyroAssist = true;
        public AudioClip DingClip;
        public AudioSource Audio;

        private const float StopRpm = 120f;
        private const float HighStabilityRpm = 7000f;
        private const float BowlAssistStrength = 0.62f;
        private const float RimReturnStrength = 2.4f;
        private float visualSpinRadians;
        private float lastDingTime;
        private Vector3 startPosition;
        private Quaternion startRotation;

        public int CollisionCount { get; private set; }
        public float CurrentSpinRpm { get { return SpinRpm(); } }
        public float CurrentTiltDegrees { get { return Vector3.Angle(transform.up, Vector3.up); } }
        public float CurrentSpeed { get { return new Vector2(Body.linearVelocity.x, Body.linearVelocity.z).magnitude; } }
        public float CurrentRadius { get { return new Vector2(transform.position.x, transform.position.z).magnitude; } }

        public string TelemetryLine
        {
            get
            {
                if (Body == null)
                {
                    return $"{Label}: no body";
                }

                return $"{Label}: {CurrentSpinRpm:0} RPM | tilt {CurrentTiltDegrees:0.0} deg | speed {CurrentSpeed:0.00} | radius {CurrentRadius:0.00} | hits {CollisionCount}";
            }
        }

        private void Awake()
        {
            SetLaunchPose(transform.position, transform.rotation);
        }

        public void SetLaunchPose(Vector3 position, Quaternion rotation)
        {
            startPosition = position;
            startRotation = rotation;
        }

        public void Launch()
        {
            if (Body == null)
            {
                return;
            }

            Body.position = startPosition;
            Body.rotation = startRotation;
            Body.linearVelocity = LaunchVelocity;
            Body.angularVelocity = Vector3.up * RpmToRadiansPerSecond(LaunchRpm);
            Body.WakeUp();
            visualSpinRadians = 0f;
            CollisionCount = 0;
        }

        private void FixedUpdate()
        {
            StepForSimulation(Time.fixedDeltaTime);
        }

        public void StepForSimulation(float deltaSeconds)
        {
            if (Body == null || Stadium == null)
            {
                return;
            }

            ApplySpinAndTumbleDamping(deltaSeconds);
            if (UseGyroAssist)
            {
                ApplyGyroscopicStability(deltaSeconds);
            }

            if (UseAnalyticBowlAssist)
            {
                ApplyBowlAssist(deltaSeconds);
                ApplyRimBanking();
            }

            ClampVerticalBounce();
            visualSpinRadians = Mathf.Repeat(visualSpinRadians + Mathf.Min(SpinRpm(), 720f) * 6f * deltaSeconds, 360f);
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (DingClip == null || Audio == null || Time.time - lastDingTime < 0.055f)
            {
                return;
            }

            if (collision.relativeVelocity.magnitude < 0.45f)
            {
                return;
            }

            CollisionCount += 1;
            Audio.pitch = Random.Range(0.92f, 1.08f);
            Audio.PlayOneShot(DingClip, Mathf.Clamp01(collision.relativeVelocity.magnitude / 3f));
            lastDingTime = Time.time;
        }

        private void ApplySpinAndTumbleDamping(float deltaSeconds)
        {
            var up = transform.up.normalized;
            var angularVelocity = Body.angularVelocity;
            var spin = Vector3.Dot(angularVelocity, up);
            var spinVector = up * spin;
            var tumble = angularVelocity - spinVector;
            var spinLoss = Mathf.Exp(-(0.012f + Traction * 0.0025f) * deltaSeconds);
            var tumbleLoss = Mathf.Exp(-(0.55f + Traction * 0.18f) * deltaSeconds);
            Body.angularVelocity = spinVector * spinLoss + tumble * tumbleLoss;
        }

        private void ApplyGyroscopicStability(float deltaSeconds)
        {
            var up = transform.up.normalized;
            var spinRpm = SpinRpm();
            if (spinRpm <= StopRpm)
            {
                return;
            }

            var stability = Mathf.Clamp01((spinRpm - 250f) / HighStabilityRpm);
            var tiltAxis = Vector3.Cross(up, Vector3.up);
            if (tiltAxis.sqrMagnitude > 0.0001f)
            {
                var tiltDegrees = Vector3.Angle(up, Vector3.up);
                var rightingTorque = tiltAxis.normalized * (Body.mass * 9.81f * (0.12f + stability * 0.88f) * Mathf.Clamp01(tiltDegrees / 35f));
                Body.AddTorque(rightingTorque, ForceMode.Force);
            }

            var angularVelocity = Body.angularVelocity;
            var spinVector = up * Vector3.Dot(angularVelocity, up);
            var tumble = angularVelocity - spinVector;
            Body.angularVelocity = spinVector + tumble * Mathf.Exp(-(2.4f + stability * 9.5f) * deltaSeconds);
        }

        private void ApplyBowlAssist(float deltaSeconds)
        {
            var radius = new Vector2(transform.position.x, transform.position.z).magnitude;
            if (radius < 0.35f)
            {
                return;
            }

            var surfaceY = Stadium.SurfaceY(transform.position);
            var nearSurface = transform.position.y <= surfaceY + 0.42f;
            if (!nearSurface)
            {
                return;
            }

            var inward = Stadium.InwardNormal(transform.position);
            var radiusProgress = Mathf.Clamp01(radius / Stadium.PlayRadius);
            var lowSpin = Mathf.Clamp01((4600f - SpinRpm()) / 4600f);
            var force = inward * (Body.mass * 9.81f * BowlAssistStrength * radiusProgress * (0.35f + lowSpin * 0.65f));
            Body.AddForce(force, ForceMode.Force);

            var velocity = Body.linearVelocity;
            var radialSpeed = Vector3.Dot(velocity, -inward);
            if (radialSpeed > 0f && lowSpin > 0.15f)
            {
                Body.linearVelocity = velocity - (-inward * radialSpeed * (0.025f + lowSpin * 0.06f));
            }
        }

        private void ApplyRimBanking()
        {
            if (Stadium.IsPocket(transform.position))
            {
                return;
            }

            var flat = new Vector3(transform.position.x, 0f, transform.position.z);
            var radius = flat.magnitude;
            var bankStart = Stadium.OuterBankStartRadius();
            if (radius <= bankStart || radius < 0.001f)
            {
                return;
            }

            var inward = -flat.normalized;
            var pressure = Mathf.Clamp01((radius - bankStart) / Mathf.Max(Stadium.WallRadius - bankStart, 0.001f));
            var lowSpin = Mathf.Clamp01((6200f - SpinRpm()) / 6200f);
            Body.AddForce(inward * (Body.mass * 9.81f * RimReturnStrength * pressure * (0.55f + lowSpin * 0.45f)), ForceMode.Force);

            if (radius > Stadium.WallRadius - 0.35f && Body.linearVelocity.magnitude < 1.2f)
            {
                var reentryRadius = Mathf.Lerp(bankStart, Stadium.WallRadius - 0.65f, 0.25f);
                Body.position = new Vector3(flat.normalized.x * reentryRadius, Body.position.y, flat.normalized.z * reentryRadius);
                var radialSpeed = Vector3.Dot(Body.linearVelocity, flat.normalized);
                if (radialSpeed > 0f)
                {
                    Body.linearVelocity -= flat.normalized * radialSpeed * 1.15f;
                }
            }
        }

        private void ClampVerticalBounce()
        {
            if (Body.linearVelocity.y > 0.55f)
            {
                Body.linearVelocity = new Vector3(Body.linearVelocity.x, 0.55f, Body.linearVelocity.z);
            }
        }

        private float SpinRpm()
        {
            var spinRadians = Mathf.Abs(Vector3.Dot(Body.angularVelocity, transform.up.normalized));
            return spinRadians * 60f / (Mathf.PI * 2f);
        }

        private static float RpmToRadiansPerSecond(float rpm)
        {
            return rpm * Mathf.PI * 2f / 60f;
        }
    }
}
