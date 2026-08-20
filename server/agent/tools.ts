type ToolResult = { tool: "clima" | "notícias" | "câmbio"; content: string; sourceUrl: string };

async function readJson(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Fonte externa indisponível (${response.status}).`);
  return response.json() as Promise<Record<string, any>>;
}

export async function searchWeather(place: string): Promise<ToolResult> {
  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=${encodeURIComponent(place)}`;
  const geocode = await readJson(geocodeUrl);
  const location = geocode.results?.[0];
  if (!location) throw new Error("Localização não encontrada para clima.");
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
  const weather = await readJson(weatherUrl);
  const current = weather.current;
  return {
    tool: "clima",
    sourceUrl: "https://open-meteo.com/en/docs",
    content: `Clima em ${location.name}${location.country ? `, ${location.country}` : ""}: ${current.temperature_2m}°C, sensação de ${current.apparent_temperature}°C, vento de ${current.wind_speed_10m} km/h e precipitação de ${current.precipitation} mm. Código meteorológico WMO: ${current.weather_code}.`,
  };
}

export async function searchNews(query: string): Promise<ToolResult> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&maxrecords=5&query=${encodeURIComponent(query)}`;
  const payload = await readJson(url);
  const articles = Array.isArray(payload.articles) ? payload.articles.slice(0, 5) : [];
  if (articles.length === 0) throw new Error("Nenhuma notícia encontrada para essa consulta.");
  const items = articles.map((article: Record<string, string>, index: number) =>
    `${index + 1}. ${article.title ?? "Sem título"}${article.domain ? ` — ${article.domain}` : ""}${article.url ? ` (${article.url})` : ""}`,
  );
  return { tool: "notícias", sourceUrl: "https://www.gdeltproject.org/", content: `Notícias para “${query}”:\n${items.join("\n")}` };
}

export async function convertCurrency(base: string, quote: string, amount: number): Promise<ToolResult> {
  const normalizedBase = base.toUpperCase();
  const normalizedQuote = quote.toUpperCase();
  const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(normalizedBase)}/${encodeURIComponent(normalizedQuote)}`;
  const rate = await readJson(url);
  const value = Number(rate.rate) * amount;
  if (!Number.isFinite(value)) throw new Error("Não foi possível calcular o câmbio solicitado.");
  return {
    tool: "câmbio",
    sourceUrl: "https://frankfurter.dev/docs/",
    content: `Câmbio: ${amount.toLocaleString("pt-BR")} ${normalizedBase} = ${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${normalizedQuote}. Taxa consultada: ${rate.rate}. Data de referência: ${rate.date ?? "não informada"}.`,
  };
}
