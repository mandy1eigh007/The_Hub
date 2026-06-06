export function Header({ mode, user, hasClaudeKey, hasGptKey, prefs, streaming, syncing, synced, dispatch }) {
  const setMode = m => dispatch({ type: 'SET_MODE', mode: m });

  return (
    <header>
      <button class="logo" onClick={() => dispatch({ type: 'SHOW_PAGE', page: 'chat' })}>
        <div class="logo-mark">⬡</div>
        <div class="logo-name">The Hub</div>
      </button>
      <div class="hsep" />

      <div class="mode-bar">
        <button
          class={`mpill mc${mode === 'claude' ? ' active' : ''}`}
          onClick={() => setMode('claude')}
          title="Claude (Alt+1)"
          disabled={streaming}
        >
          <div class="pdot" style="background:var(--ac)" />
          Claude
        </button>
        <button
          class={`mpill mg${mode === 'gpt' ? ' active' : ''}`}
          onClick={() => setMode('gpt')}
          title="ChatGPT (Alt+2)"
          disabled={streaming}
        >
          <div class="pdot" style="background:var(--gpt)" />
          ChatGPT
        </button>
        <button
          class={`mpill mb${mode === 'both' ? ' active' : ''}`}
          onClick={() => setMode('both')}
          title="Both (Alt+3)"
          disabled={streaming}
        >
          <div class="pdot" style="background:var(--ac)" />
          <div class="pdot" style="background:var(--gpt);margin-left:-3px" />
          Both
        </button>
      </div>

      <div class="hright">
        <div class="keystatus" title="API key status">
          <div class={`kdot${hasClaudeKey ? ' on' : ' off'}`} />
          <div class={`kdot${hasGptKey ? ' on' : ' off'}`} style="margin-left:2px" />
        </div>
        <div class="hsep" />
        <div class="synci">
          <div class={`sdot${syncing ? ' syncing' : synced ? ' on' : ''}`} />
          <span>{prefs.folderId ? 'drive' : 'local'}</span>
        </div>
        <div class="hsep" />
        <div class="uchip">
          <div class="uav">
            {user?.picture
              ? <img src={user.picture} alt="" />
              : (user?.name || 'U')[0]}
          </div>
          <span>{(user?.name || 'User').split(' ')[0]}</span>
        </div>
        <a href="/auth/logout" class="btn btn-g btn-sm">Sign out</a>
      </div>
    </header>
  );
}
