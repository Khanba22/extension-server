const BASE_URL = 'https://www.coursera.org/api/';

const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
  'x-coursera-application': 'ondemand',
  'x-coursera-version': 'cde5f24972aff1ebd6447e911113e781b9c52f7f',
  'x-requested-with': 'XMLHttpRequest'
};

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (_) { json = {}; }
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status} for ${url}`);
    err.status = resp.status;
    err.body = json;
    throw err;
  }
  return json;
}

function buildCookie(cAuth, csrf) {
  const parts = [];
  if (cAuth) parts.push(`CAUTH=${cAuth}`);
  if (csrf) parts.push(`CSRF3-Token=${csrf}`);
  return parts.join('; ');
}

async function getUserId(headers) {
  const data = await fetchJson(`${BASE_URL}adminUserPermissions.v1?q=my`, { headers });
  try {
    return data.elements[0].id;
  } catch (_) {
    throw new Error('Unable to resolve user id');
  }
}

async function getCourseIdAndModules(courseSlug, headers) {
  const url = `${BASE_URL}onDemandCourseMaterials.v2/?q=slug&slug=${encodeURIComponent(courseSlug)}&includes=modules`;
  const data = await fetchJson(url, { headers });
  const courseId = data.elements?.[0]?.id;
  if (!courseId) throw new Error('Unable to resolve course id');
  return { courseId };
}

async function getItems(courseSlug, headers) {
  const params = new URLSearchParams({
    q: 'slug',
    slug: courseSlug,
    includes: 'passableItemGroups,passableItemGroupChoices,items,tracks,gradePolicy,gradingParameters',
    fields: 'onDemandCourseMaterialItems.v2(name,slug,timeCommitment,trackId)',
    showLockedItems: 'true'
  });
  const url = `${BASE_URL}onDemandCourseMaterials.v2/?${params.toString()}`;
  const data = await fetchJson(url, { headers });
  return data.linked?.['onDemandCourseMaterialItems.v2'] || [];
}

async function postVideoEnded(userId, courseSlug, itemId, headers) {
  const url = `${BASE_URL}opencourse.v1/user/${userId}/course/${courseSlug}/item/${itemId}/lecture/videoEvents/ended?autoEnroll=false`;
  return await fetchJson(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ contentRequestBody: {} }) });
}

async function postSupplementCompletion(courseId, itemId, userId, headers) {
  const url = `${BASE_URL}onDemandSupplementCompletions.v1`;
  return await fetchJson(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ courseId, itemId, userId: Number(userId) }) });
}

async function runCourseCompletion(courseSlug, cAuth, csrf) {
  const headers = { ...DEFAULT_HEADERS, cookie: buildCookie(cAuth, csrf) };
  const userId = await getUserId(headers);
  const { courseId } = await getCourseIdAndModules(courseSlug, headers);
  const items = await getItems(courseSlug, headers);

  let moduleCount = 0;
  for (const item of items) {
    const itemId = item.id;
    if (!itemId) continue;
    moduleCount += 1;
    const r = await postVideoEnded(userId, courseSlug, itemId, headers).catch(() => ({}));
    if (!r || r.contentResponseBody == null) {
      await postSupplementCompletion(courseId, itemId, userId, headers).catch(() => {});
    }
  }

  return moduleCount;
}

module.exports = { runCourseCompletion };


