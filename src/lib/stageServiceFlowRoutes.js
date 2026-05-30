export function buildStageServiceDetailPath({ serviceKey, name = "", email = "", phone = "" }) {
  const params = new URLSearchParams();

  if (serviceKey) {
    params.set("service", serviceKey);
  }

  if (name) {
    params.set("name", name);
  }

  if (email) {
    params.set("email", email);
  }

  if (phone) {
    params.set("phone", phone);
  }

  const query = params.toString();
  return query ? `/apply/stage-services/detail?${query}` : "/apply/stage-services/detail";
}
