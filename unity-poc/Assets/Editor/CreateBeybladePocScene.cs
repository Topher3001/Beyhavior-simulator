#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BeybladePhysicsPoc.Editor
{
    public static class CreateBeybladePocScene
    {
        private const string SceneFolder = "Assets/Scenes";
        private const string ScenePath = "Assets/Scenes/BeybladeUnityPhysicsPoc.unity";

        [MenuItem("Beyblade POC/Create Or Open POC Scene")]
        public static void CreateOrOpen()
        {
            if (!Directory.Exists(SceneFolder))
            {
                Directory.CreateDirectory(SceneFolder);
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var runnerObject = new GameObject("Beyblade Unity Physics POC");
            runnerObject.AddComponent<BeybladePocRunner>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorSceneManager.OpenScene(ScenePath);
            Selection.activeGameObject = runnerObject;
            Debug.Log($"Created Beyblade Unity physics proof-of-concept scene at {ScenePath}");
        }
    }
}
#endif
