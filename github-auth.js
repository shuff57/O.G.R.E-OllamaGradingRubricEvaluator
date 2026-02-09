// GitHub Authentication Helper
class GitHubAuth {
  constructor() {
    this.token = null;
    this.user = null;
    this.loadFromStorage();
  }

  async loadFromStorage() {
    const result = await chrome.storage.local.get(['githubToken', 'githubUser']);
    this.token = result.githubToken;
    this.user = result.githubUser;
    return { token: this.token, user: this.user };
  }

  async saveToStorage(token, user) {
    await chrome.storage.local.set({ githubToken: token, githubUser: user });
    this.token = token;
    this.user = user;
  }

  async signIn() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'githubSignIn' }, async (response) => {
        if (response.success) {
          // Note: response.code needs to be exchanged for a token
          // This requires a backend server or GitHub App
          console.log('Authorization code:', response.code);
          console.log('Redirect URL for your GitHub OAuth app:', response.redirectUrl);
          
          // For now, prompt user to manually create token
          alert('Please create a Personal Access Token at:\nhttps://github.com/settings/tokens/new\n\nGrant "repo" and "user" scopes, then paste it in the GitHub Token field.');
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async signOut() {
    await chrome.storage.local.remove(['githubToken', 'githubUser']);
    this.token = null;
    this.user = null;
  }

  async getUserInfo() {
    if (!this.token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    const user = await response.json();
    await this.saveToStorage(this.token, user);
    return user;
  }

  isAuthenticated() {
    return !!this.token;
  }
}

// Export for use in sidepanel
if (typeof window !== 'undefined') {
  window.GitHubAuth = GitHubAuth;
}
