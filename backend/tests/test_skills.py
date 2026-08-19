import unittest

from fastapi.testclient import TestClient

from app.main import app

EMPLOYEE_EMAIL = "sohammore@intellifysolutions.com"
PASSWORD = "Password@123"


class SkillProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _login(self) -> dict[str, str]:
        response = self.client.post(
            "/api/auth/login",
            json={"email": EMPLOYEE_EMAIL, "password": PASSWORD},
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def test_catalog_is_standardized_and_user_can_crud_skills(self):
        headers = self._login()
        catalog = self.client.get("/api/skills", headers=headers)
        self.assertEqual(catalog.status_code, 200)
        self.assertGreaterEqual(len(catalog.json()), 5)
        names = {item["name"] for item in catalog.json()}
        self.assertIn("Python", names)
        skill = next(item for item in catalog.json() if item["name"] == "Python")

        created = self.client.post(
            "/api/users/me/skills",
            json={"skill_id": skill["id"], "proficiency": "ADVANCED"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["skill_name"], "Python")
        self.assertEqual(created.json()["proficiency"], "ADVANCED")
        user_skill_id = created.json()["id"]

        duplicate = self.client.post(
            "/api/users/me/skills",
            json={"skill_id": skill["id"], "proficiency": "BEGINNER"},
            headers=headers,
        )
        self.assertEqual(duplicate.status_code, 400)

        updated = self.client.put(
            f"/api/users/me/skills/{user_skill_id}",
            json={"proficiency": "EXPERT"},
            headers=headers,
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["proficiency"], "EXPERT")

        listed = self.client.get("/api/users/me/skills", headers=headers)
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(item["id"] == user_skill_id for item in listed.json()))

        deleted = self.client.delete(f"/api/users/me/skills/{user_skill_id}", headers=headers)
        self.assertEqual(deleted.status_code, 200, deleted.text)

        after = self.client.get("/api/users/me/skills", headers=headers)
        self.assertFalse(any(item["id"] == user_skill_id for item in after.json()))

    def test_unknown_skill_is_rejected(self):
        headers = self._login()
        response = self.client.post(
            "/api/users/me/skills",
            json={"skill_id": "not-a-real-skill", "proficiency": "BEGINNER"},
            headers=headers,
        )
        self.assertEqual(response.status_code, 404)

    def _remove_named_skills(self, headers: dict[str, str], *names: str) -> None:
        listed = self.client.get("/api/users/me/skills", headers=headers)
        self.assertEqual(listed.status_code, 200)
        wanted = {name.lower() for name in names}
        for item in listed.json():
            if item["skill_name"].lower() in wanted:
                deleted = self.client.delete(f"/api/users/me/skills/{item['id']}", headers=headers)
                self.assertEqual(deleted.status_code, 200, deleted.text)

    def test_other_skill_is_created_and_saved(self):
        headers = self._login()
        custom_name = "Amazon LEX"
        self._remove_named_skills(headers, custom_name)

        created = self.client.post(
            "/api/users/me/skills",
            json={"custom_name": custom_name, "proficiency": "INTERMEDIATE"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["skill_name"], custom_name)
        self.assertEqual(created.json()["skill_category"], "Other")
        user_skill_id = created.json()["id"]

        catalog = self.client.get("/api/skills", headers=headers)
        self.assertEqual(catalog.status_code, 200)
        match = next(item for item in catalog.json() if item["name"].lower() == custom_name.lower())
        self.assertEqual(match["category"], "Other")

        self.client.delete(f"/api/users/me/skills/{user_skill_id}", headers=headers)

    def test_bulk_add_supports_catalog_and_other(self):
        headers = self._login()
        catalog = self.client.get("/api/skills", headers=headers)
        self.assertEqual(catalog.status_code, 200)
        by_name = {item["name"]: item for item in catalog.json()}
        java = by_name["Java"]
        react = by_name["React"]
        custom_name = "Boto3"
        self._remove_named_skills(headers, "Java", "React", custom_name)

        created = self.client.post(
            "/api/users/me/skills/bulk",
            json={
                "skill_ids": [java["id"], react["id"]],
                "custom_names": [custom_name],
                "proficiency": "ADVANCED",
            },
            headers=headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        names = {item["skill_name"] for item in created.json()}
        self.assertEqual(names, {"Java", "React", custom_name})
        self.assertTrue(all(item["proficiency"] == "ADVANCED" for item in created.json()))

        empty = self.client.post(
            "/api/users/me/skills/bulk",
            json={"skill_ids": [], "custom_names": [], "proficiency": "BEGINNER"},
            headers=headers,
        )
        self.assertEqual(empty.status_code, 400)

        for item in created.json():
            self.client.delete(f"/api/users/me/skills/{item['id']}", headers=headers)


if __name__ == "__main__":
    unittest.main()
