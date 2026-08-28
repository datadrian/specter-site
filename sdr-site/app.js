(function(){
  'use strict';
  const API='https://specter-imaging.com/api';
  document.querySelectorAll('[data-checkout-product]').forEach(button=>button.addEventListener('click',async()=>{
    const original=button.textContent;button.disabled=true;button.textContent='INITIALIZING CHECKOUT...';
    try{const response=await fetch(`${API}/create-checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:button.dataset.checkoutProduct})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error(data.error||'Checkout unavailable');location.href=data.url}catch(error){button.disabled=false;button.textContent=original;alert(error.message||'Checkout could not be started.');}
  }));
  const form=document.getElementById('support-form');
  if(form)form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type=submit]');const status=document.getElementById('support-status');button.disabled=true;status.className='form-status';status.textContent='SENDING SUPPORT REQUEST...';try{const data=Object.fromEntries(new FormData(form).entries());const response=await fetch(`${API}/support-submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,source:'specter-sdr-site',meta:{product:'sdr',topic:data.topic||'general'}})});const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw new Error(result.error||'Support request failed');form.reset();status.className='form-status ok';status.textContent=`TICKET ${result.ticketId} CREATED. A CONFIRMATION EMAIL IS ON THE WAY.`}catch(error){status.className='form-status error';status.textContent=error.message||'REQUEST FAILED. EMAIL SUPPORT@SPECTER-IMAGING.COM.'}finally{button.disabled=false}});
})();
