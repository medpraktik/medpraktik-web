const { json, methodNotAllowed, optionalEnv } = require("../server/sales-config");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res);

  const installerUrl = optionalEnv("PUBLIC_INSTALLER_URL");
  res.setHeader("Cache-Control", "public, max-age=60");
  return json(res, 200, {
    installerUrl: /^https?:\/\//i.test(installerUrl) ? installerUrl : "",
  });
};
