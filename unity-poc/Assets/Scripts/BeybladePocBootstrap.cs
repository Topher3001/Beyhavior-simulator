using UnityEngine;

namespace BeybladePhysicsPoc
{
    public static class BeybladePocBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateRunner()
        {
            if (Object.FindObjectOfType<BeybladePocRunner>() != null)
            {
                return;
            }

            var runnerObject = new GameObject("Beyblade Unity Physics POC");
            runnerObject.AddComponent<BeybladePocRunner>();
        }
    }
}
