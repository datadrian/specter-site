(function(){
  'use strict';
  const API='https://specter-imaging.com/api';
  document.querySelectorAll('[data-checkout-product]').forEach(button=>button.addEventListener('click',async()=>{
    const original=button.textContent;button.disabled=true;button.textContent='INITIALIZING CHECKOUT...';
    try{const response=await fetch(`${API}/create-checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:button.dataset.checkoutProduct})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.url)throw new Error(data.error||'Checkout unavailable');location.href=data.url}catch(error){button.disabled=false;button.textContent=original;alert(error.message||'Checkout could not be started.');}
  }));
  const zoomableImages=Array.from(document.querySelectorAll('main img'));
  if(zoomableImages.length){
    const lightbox=document.createElement('div');
    lightbox.className='image-lightbox';
    lightbox.hidden=true;
    lightbox.setAttribute('role','dialog');
    lightbox.setAttribute('aria-modal','true');
    lightbox.setAttribute('aria-label','Fullscreen image viewer');
    lightbox.innerHTML='<button type="button" class="image-lightbox-close" aria-label="Close fullscreen image">CLOSE</button><img alt=""><p class="image-lightbox-caption"></p>';
    document.body.appendChild(lightbox);
    const lightboxImage=lightbox.querySelector('img');
    const caption=lightbox.querySelector('.image-lightbox-caption');
    const closeButton=lightbox.querySelector('.image-lightbox-close');
    let returnFocus=null;
    const closeLightbox=()=>{
      if(lightbox.hidden)return;
      lightbox.classList.remove('open');
      lightbox.hidden=true;
      lightboxImage.removeAttribute('src');
      document.body.classList.remove('lightbox-open');
      if(returnFocus) returnFocus.focus({preventScroll:true});
    };
    const openLightbox=image=>{
      returnFocus=image;
      lightboxImage.src=image.currentSrc||image.src;
      lightboxImage.alt=image.alt||'Expanded SPECTER SDR screenshot';
      const figureCaption=image.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
      caption.textContent=figureCaption||image.alt||'';
      caption.hidden=!caption.textContent;
      lightbox.hidden=false;
      document.body.classList.add('lightbox-open');
      requestAnimationFrame(()=>lightbox.classList.add('open'));
      closeButton.focus({preventScroll:true});
    };
    zoomableImages.forEach(image=>{
      image.classList.add('image-zoomable');
      image.tabIndex=0;
      image.setAttribute('role','button');
      image.setAttribute('aria-label',`${image.alt||'SPECTER SDR screenshot'}. Open fullscreen image.`);
      image.addEventListener('click',()=>openLightbox(image));
      image.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox(image);}
      });
    });
    closeButton.addEventListener('click',closeLightbox);
    lightbox.addEventListener('click',event=>{if(event.target===lightbox)closeLightbox();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeLightbox();});
  }
  const form=document.getElementById('support-form');
  if(form)form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type=submit]');const status=document.getElementById('support-status');button.disabled=true;status.className='form-status';status.textContent='SENDING SUPPORT REQUEST...';try{const data=Object.fromEntries(new FormData(form).entries());const response=await fetch(`${API}/support-submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,source:'specter-sdr-site',meta:{product:'sdr',topic:data.topic||'general'}})});const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)throw new Error(result.error||'Support request failed');form.reset();status.className='form-status ok';status.textContent=`TICKET ${result.ticketId} CREATED. A CONFIRMATION EMAIL IS ON THE WAY.`}catch(error){status.className='form-status error';status.textContent=error.message||'REQUEST FAILED. EMAIL SUPPORT@SPECTER-IMAGING.COM.'}finally{button.disabled=false}});
})();
