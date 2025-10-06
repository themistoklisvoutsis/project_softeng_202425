(function(){
  const form = document.getElementById('loginForm');
  const alertBox = document.getElementById('alert');

  const showErr = (m)=>{ alertBox.textContent=m; alertBox.classList.remove('d-none'); };
  const hideErr = ()=> alertBox.classList.add('d-none');

  // toggle password
  document.getElementById('togglePwd')?.addEventListener('click', ()=>{
    const input = document.getElementById('password');
    const icon = document.getElementById('pwdIcon');
    const isPwd = input.type === 'password';
    input.type = isPwd ? 'text' : 'password';
    icon.classList.toggle('bi-eye-slash-fill', isPwd);
    icon.classList.toggle('bi-eye-fill', !isPwd);
  });

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault(); // δεν κάνουμε κανονικό POST
    hideErr();

    const name = (document.getElementById('name')?.value || '').trim();
    const password = (document.getElementById('password')?.value || '');

    if (!name || !password) {
      showErr('Συμπληρώστε όνομα και κωδικό.');
      return;
    }

    try{
      // login μέσω api.js (auth_login)
      await window.api('auth_login', { method:'POST', body:{ name, password } });
      // επιτυχία -> μετάβαση στην αρχική σου σελίδα
      window.location.href = 'index.html';
    }catch(err){
      if (err?.code === 'INVALID_CREDENTIALS') return showErr('Λάθος στοιχεία.');
      if (err?.code === 'AUTH_REQUIRED') return showErr('Απαιτείται σύνδεση.');
      showErr(err?.message || 'Σφάλμα σύνδεσης.');
    }
  });
})();
