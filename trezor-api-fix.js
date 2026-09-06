const originalFetch = global.fetch;

global.fetch = async function (...args) {
  const response = await originalFetch(...args);

  const requestUrl =
    typeof args[0] === "string"
      ? args[0]
      : args[0]?.url || "";

  if (!requestUrl.includes(".api.hasoffers.com/Apiv3/json")) {
    return response;
  }

  const originalJson = response.json.bind(response);
  let cachedJson = null;

  response.json = async function () {
    if (cachedJson === null) {
      cachedJson = await originalJson();
    }

    const clickUrl = cachedJson?.response?.data?.click_url;

    if (
      clickUrl &&
      cachedJson?.response?.data &&
      !cachedJson.response.data.tracking_url
    ) {
      cachedJson.response.data.tracking_url = clickUrl;
    }

    return cachedJson;
  };

  return response;
};
