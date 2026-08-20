export async function getGitHubConnectionStatus() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { configured: false, message: "A integração permanece desativada até que o owner opte por conectar o GitHub." };
  }

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      return { configured: false, message: "O token GitHub não foi validado. A integração continua em modo seguro." };
    }
    return { configured: true, message: "Integração pronta para operações explicitamente autorizadas pelo owner." };
  } catch {
    return { configured: false, message: "Não foi possível verificar o GitHub agora. A integração continua em modo seguro." };
  }
}
