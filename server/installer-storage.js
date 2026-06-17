const { optionalEnv, requireEnv } = require("./sales-config");

const DEFAULT_INSTALLER_BUCKET = "medpraktik-installers";
const DEFAULT_INSTALLER_OBJECT_PATH = "v1.1.0/MedPraktik-v1.1.0-Setup.exe";
const DEFAULT_INSTALLER_EXPIRES_SECONDS = 60 * 60;

function installerConfig() {
  return {
    bucket: optionalEnv("INSTALLER_BUCKET") || DEFAULT_INSTALLER_BUCKET,
    objectPath: optionalEnv("INSTALLER_OBJECT_PATH") || DEFAULT_INSTALLER_OBJECT_PATH,
    expiresIn: Number(optionalEnv("INSTALLER_LINK_EXPIRES_SECONDS")) || DEFAULT_INSTALLER_EXPIRES_SECONDS,
  };
}

function storageHeaders() {
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function createInstallerSignedUrl() {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const { bucket, objectPath, expiresIn } = installerConfig();
  const response = await fetch(
    `${baseUrl}/storage/v1/object/sign/${bucket}/${encodeURI(objectPath)}`,
    {
      method: "POST",
      headers: storageHeaders(),
      body: JSON.stringify({ expiresIn }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.message || response.statusText;
    throw new Error(`Supabase Storage ${response.status}: ${message}`);
  }

  const signedPath = data.signedURL || data.signedUrl || data.signed_url;
  if (!signedPath) throw new Error("Supabase Storage did not return a signed URL.");
  return signedPath.startsWith("http") ? signedPath : `${baseUrl}/storage/v1${signedPath}`;
}

module.exports = {
  createInstallerSignedUrl,
  installerConfig,
};
