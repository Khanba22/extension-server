import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "script"))
from course_completion import Skipera  # type: ignore


def run_course_completion(course_slug: str, cauth: str, csrf: str) -> int:
    skipera = Skipera(course_slug, cauth, csrf)
    skipera.get_modules()
    skipera.get_items()
    return int(skipera.moduleCount)


class VercelHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('content-length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            payload = json.loads(body or '{}')
        except json.JSONDecodeError:
            payload = {}

        course_slug = payload.get('courseSlug')
        cauth = payload.get('cAuth')
        csrf = payload.get('csrf')

        if not course_slug or not cauth or not csrf:
            self.send_response(400)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({ 'error': 'Missing required fields' }).encode('utf-8'))
            return

        try:
            modules = run_course_completion(course_slug, cauth, csrf)
            self.send_response(200)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({ 'modulesSkipped': modules }).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({ 'error': str(e) }).encode('utf-8'))


def handler(request, response):
    # This is for @vercel/python runtime
    try:
        length = int(request.headers.get('content-length') or 0)
        body = request.rfile.read(length).decode('utf-8') if length else '{}'
        payload = json.loads(body)

        course_slug = payload.get('courseSlug')
        cauth = payload.get('cAuth')
        csrf = payload.get('csrf')

        if not course_slug or not cauth or not csrf:
            response.status_code = 400
            response.headers['content-type'] = 'application/json'
            response.body = json.dumps({ 'error': 'Missing required fields' }).encode('utf-8')
            return response

        modules = run_course_completion(course_slug, cauth, csrf)
        response.status_code = 200
        response.headers['content-type'] = 'application/json'
        response.body = json.dumps({ 'modulesSkipped': modules }).encode('utf-8')
        return response
    except Exception as e:
        response.status_code = 500
        response.headers['content-type'] = 'application/json'
        response.body = json.dumps({ 'error': str(e) }).encode('utf-8')
        return response


