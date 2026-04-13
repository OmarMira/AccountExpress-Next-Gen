async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/companies/bcda3cc1-616f-4bbb-a00f-5058ccb33c36/purge', { 
      method: 'DELETE' 
    }); 
    console.log('Status:', res.status); 
    console.log('Body:', await res.text());
  } catch (err) {
    console.error('Fetch error:', err);
  }
  process.exit(0);
}
test();
