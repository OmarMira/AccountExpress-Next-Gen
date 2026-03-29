const resp = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'AccountExpress@2026!'
  })
});

const data = await resp.json();
console.log('Status:', resp.status);
console.log('Body:', JSON.stringify(data, null, 2));
