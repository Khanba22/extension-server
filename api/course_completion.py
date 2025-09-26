import json
import os
import sys
from flask import Flask, request, jsonify

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "script"))
from course_completion import Skipera  # type: ignore


def run_course_completion(course_slug: str, cauth: str, csrf: str) -> int:
    skipera = Skipera(course_slug, cauth, csrf)
    skipera.get_modules()
    skipera.get_items()
    return int(skipera.moduleCount)


app = Flask(__name__)


@app.route("/", methods=["POST"])
def course_completion_route():
    payload = request.get_json(silent=True) or {}
    course_slug = payload.get("courseSlug")
    cauth = payload.get("cAuth")
    csrf = payload.get("csrf")
    if not course_slug or not cauth or not csrf:
        return jsonify({"error": "Missing required fields"}), 400

    try:
        modules = run_course_completion(course_slug, cauth, csrf)
        return jsonify({"modulesSkipped": modules})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



