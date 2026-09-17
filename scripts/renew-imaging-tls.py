"""Renew Imaging TLS through authoritative Cloudflare DNS, install on Netlify.
Run without arguments. No credentials or private certificate material are printed.
Required env: CLOUDFLARE_API_TOKEN_3, NETLIFY_ACCESS_TOKEN.
Restricted to specter-imaging.com and its www alias, not field tunnels.
"""
import os,sys,json,ssl,socket,tempfile,subprocess,urllib.request,urllib.parse,shutil
from pathlib import Path
from datetime import datetime,timezone
SITE='06c9bd88-0517-4bbb-9484-858c531d0f9a'
DOMAINS=['specter-imaging.com','www.specter-imaging.com']
def net(path,data=None):
 h={'Authorization':'Bearer '+os.environ['NETLIFY_ACCESS_TOKEN']}
 if data is not None:h['Content-Type']='application/x-www-form-urlencoded'
 return json.load(urllib.request.urlopen(urllib.request.Request('https://api.netlify.com/api/v1/sites/'+SITE+path,data=urllib.parse.urlencode(data).encode() if data is not None else None,headers=h),timeout=120))
def probe():
 out=[]
 for host in DOMAINS:
  with socket.create_connection((host,443),timeout=20) as raw:
   with ssl.create_default_context().wrap_socket(raw,server_hostname=host) as sock:
    c=sock.getpeercert();remaining=(datetime.strptime(c['notAfter'],'%b %d %H:%M:%S %Y %Z').replace(tzinfo=timezone.utc)-datetime.now(timezone.utc)).days
    out.append({'host':host,'days_remaining':remaining,'expires':c['notAfter']})
 return out
try:
 current=probe()
 if min(x['days_remaining'] for x in current)>30:
  print(json.dumps({'result':'valid_no_renewal_needed','certificates':current}));sys.exit(0)
except Exception: pass
if not shutil.which('certbot'):
 subprocess.run([sys.executable,'-m','pip','install','certbot','certbot-dns-cloudflare'],check=True,stdout=subprocess.DEVNULL)
with tempfile.TemporaryDirectory(prefix='specter-tls-') as temp:
 root=Path(temp);cred=root/'cloudflare.ini';cred.write_text('dns_cloudflare_api_token = '+os.environ['CLOUDFLARE_API_TOKEN_3']+'\n');cred.chmod(0o600)
 cmd=['certbot','certonly','--non-interactive','--agree-tos','--register-unsafely-without-email','--dns-cloudflare','--dns-cloudflare-credentials',str(cred),'--dns-cloudflare-propagation-seconds','60','--config-dir',str(root/'config'),'--work-dir',str(root/'work'),'--logs-dir',str(root/'logs'),'--cert-name','specter-imaging']
 for host in DOMAINS:cmd.extend(['-d',host])
 subprocess.run(cmd,check=True)
 live=root/'config/live/specter-imaging'
 result=net('/ssl',{'certificate':(live/'cert.pem').read_text(),'key':(live/'privkey.pem').read_text(),'ca_certificates':(live/'chain.pem').read_text()})
 print(json.dumps({'result':'installed','state':result.get('state'),'expires_at':result.get('expires_at'),'domains':result.get('domains'),'custom':result.get('custom')}))
print('New certificate installed. Independently verify public HTTPS after edge propagation.')
