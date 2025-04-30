import json
import sys
import requests

HEADERS = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'x-coursera-application': 'ondemand',
    'x-coursera-version': 'cde5f24972aff1ebd6447e911113e781b9c52f7f',
    'x-requested-with': 'XMLHttpRequest',
}

BASE_URL = 'https://www.coursera.org/api/'


class Skipera:
    def __init__(self, course_slug, cauth_token, csrf_token):
        self.moduleCount = 0
        self.user_id = None
        self.course_id = None
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.session.cookies.update({
            'CAUTH': cauth_token,
            'CSRF3-Token': csrf_token
        })
        self.course = course_slug
        if self.get_userid() == 0:
            sys.exit(1)

    def get_userid(self):
        r = self.session.get(self.base_url + "adminUserPermissions.v1?q=my").json()
        try:
            self.user_id = r["elements"][0]["id"]
        except KeyError:
            return 0
        return 1

    def get_modules(self):
        r = self.session.get(self.base_url + f"onDemandCourseMaterials.v2/?q=slug&slug={self.course}&includes=modules").json()
        self.course_id = r["elements"][0]["id"]
        modules = r.get("linked", {}).get("onDemandCourseMaterialModules.v1", [])


    def get_items(self):
        r = self.session.get(self.base_url + "onDemandCourseMaterials.v2/", params={
            "q": "slug",
            "slug": self.course,
            "includes": "passableItemGroups,passableItemGroupChoices,items,tracks,gradePolicy,gradingParameters",
            "fields": "onDemandCourseMaterialItems.v2(name,slug,timeCommitment,trackId)",
            "showLockedItems": "true"
        }).json()
        items = r.get("linked", {}).get("onDemandCourseMaterialItems.v2", [])
        for video in items:
            self.moduleCount += 1
            self.watch_item(video["id"])

    def watch_item(self, item_id):
        r = self.session.post(
            self.base_url + f"opencourse.v1/user/{self.user_id}/course/{self.course}/item/{item_id}/lecture/videoEvents/ended?autoEnroll=false",
            json={"contentRequestBody": {}}).json()

        if r.get("contentResponseBody") is None:
            self.read_item(item_id)

    def read_item(self, item_id):
        r = self.session.post(self.base_url + "onDemandSupplementCompletions.v1", json={
            "courseId": self.course_id,
            "itemId": item_id,
            "userId": int(self.user_id)
        })
        


def main():
    if len(sys.argv) < 4:
        print("Usage: python course_completion.py <course_slug> <CAUTH> <CSRF3-Token>")
        return

    course_slug = sys.argv[1]
    cauth_token = sys.argv[2]
    csrf_token = sys.argv[3]

    skipera = Skipera(course_slug, cauth_token, csrf_token)
    skipera.get_modules()
    skipera.get_items()
    print(skipera.moduleCount)


if __name__ == '__main__':
    main()
    # print(1)
