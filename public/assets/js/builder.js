function builderHome(){
  return{
    csrf:'',
    prompt:'',
    guideOpen:true,
    businessName:'',
    domain:'',
    domainTouched:false,
    domainTitle:'Domain not checked',
    domainMessage:'',
    domainState:'idle',
    domainSuggestions:[],
    checkingDomain:false,
    companyRegistered:'',
    companySearch:'',
    checkingCompany:false,
    companyMessage:'',
    companyResults:[],
    selectedCompany:null,
    showCompanyHouse:false,
    voiceSupported:false,
    isListening:false,
    voiceStatus:'Voice input uses your browser microphone.',
    voicePreview:'',
    voiceBasePrompt:'',
    voiceFinalTranscript:'',
    recognition:null,
    reviewingPrompt:false,
    promptReview:null,
    approvedBlueprint:null,
    approvedGenerationMatrix:null,
    approvedImagePlan:[],
    generateImages:true,
    questionAnswers:{},
    logoName:'',
    palette:null,
    audience:'',
    positioning:'',
    fontPreference:'',
    fontOptions:['Auto choose for brand','General Sans','Inter','DM Sans','Work Sans','Instrument Serif','Cormorant Garamond','Cabinet Grotesk'],
    stylePreference:'Editorial luxury',
    styleOptions:['Editorial luxury','Premium clinic','Modern local','Bold startup','Minimal studio'],
    mustHave:'',
    briefQuestions:[
      'Who is the site trying to win over?',
      'What should make this business feel different?',
      'What proof should be highlighted?',
      'What action should visitors take first?'
    ],
    async init(){
      const r=await fetch('/csrf');
      this.csrf=(await r.json()).csrfToken;
      this.guideOpen=localStorage.getItem('builderGuideHidden')!=='true';
      this.setupVoice();
      this.updateBusinessFromPrompt(false);
    },
    guideStepIndex(){
      if(!this.companyRegistered)return 0;
      if(!this.promptReview)return 1;
      if(!this.approvedBlueprint)return 2;
      if(!this.domain)return 3;
      if(!this.logoName&&!this.palette&&!this.mustHave&&!this.audience&&!this.positioning)return 4;
      return 5;
    },
    guideStatus(){
      const index=this.guideStepIndex();
      const messages=[
        'Start by telling the builder whether this is a registered UK company.',
        'Now add the website brief. The prompt review turns rough wording into a stronger build plan.',
        'Review the pages, smart questions, image plan, and generation matrix before generation.',
        'Confirm a domain so canonical URLs, sitemap, robots.txt, and deployment notes are prepared.',
        'Optional brand inputs help the generator choose better colours, fonts, imagery, and layout.',
        'Everything is ready. Generate the site, then use Preview, Visual Editor, Download, or Deploy.'
      ];
      return messages[index]||messages[0];
    },
    scrollGuide(id){
      const target=document.getElementById(id);
      if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
    },
    hideGuide(){
      this.guideOpen=false;
      localStorage.setItem('builderGuideHidden','true');
    },
    setupVoice(){
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      this.voiceSupported=Boolean(SpeechRecognition);
      if(!this.voiceSupported){
        this.voiceStatus='Voice input is not supported in this browser. Chrome or Edge is recommended.';
        return;
      }
      const recognition=new SpeechRecognition();
      recognition.lang='en-GB';
      recognition.continuous=true;
      recognition.interimResults=true;
      recognition.onstart=()=>{
        this.voiceBasePrompt=this.prompt.trim();
        this.voiceFinalTranscript='';
        this.voicePreview='';
        this.isListening=true;
        this.voiceStatus='Listening. Speak your website brief naturally, then press Stop voice.';
      };
      recognition.onresult=(event)=>{
        let interim='';
        for(let i=event.resultIndex;i<event.results.length;i++){
          const text=event.results[i][0].transcript.trim();
          if(event.results[i].isFinal) this.voiceFinalTranscript=appendSentence(this.voiceFinalTranscript, text);
          else interim+=text;
        }
        this.voicePreview=[this.voiceFinalTranscript, interim.trim()].filter(Boolean).join(' ');
      };
      recognition.onerror=(event)=>{
        this.voiceStatus=event.error==='not-allowed'?'Microphone permission was blocked. Allow microphone access and try again.':'Voice input stopped. You can try again.';
        this.isListening=false;
      };
      recognition.onend=()=>{
        this.isListening=false;
        this.commitVoiceTranscript();
        if(this.voiceSupported && !this.voiceStatus.includes('blocked')) this.voiceStatus='Voice input ready.';
      };
      this.recognition=recognition;
    },
    startVoice(){
      if(!this.voiceSupported||!this.recognition)return;
      if(this.isListening)return;
      try{
        this.recognition.start();
      }catch{
        this.voiceStatus='Voice input is already starting. Try Stop voice, then Start voice again.';
      }
    },
    stopVoice(){
      if(!this.recognition||!this.isListening)return;
      this.voiceStatus='Stopping and adding transcript...';
      this.recognition.stop();
    },
    commitVoiceTranscript(){
      const spoken=this.voiceFinalTranscript.trim();
      if(!spoken){
        this.voicePreview='';
        return;
      }
      this.prompt=mergeVoicePrompt(this.voiceBasePrompt||this.prompt, spoken).slice(0,4000);
      this.voicePreview='';
      this.voiceFinalTranscript='';
      this.updateBusinessFromPrompt(false);
      this.reviewCurrentPrompt();
    },
    handlePromptInput(){
      this.updateBusinessFromPrompt(false);
    },
    clearPrompt(){
      this.prompt='';
      this.promptReview=null;
      this.approvedBlueprint=null;
      this.approvedGenerationMatrix=null;
      this.approvedImagePlan=[];
      this.businessName='';
      if(!this.domainTouched){
        this.domain='';
        this.domainMessage='';
        this.domainTitle='Domain not checked';
        this.domainState='idle';
        this.domainSuggestions=[];
      }
    },
    setCompanyRegistered(value){
      this.companyRegistered=value;
      if(value==='yes'){
        this.companySearch=this.companySearch||this.businessName||'';
        this.companyMessage=this.companySearch ? 'Search Companies House to attach official company data.' : '';
        return;
      }
      this.companySearch='';
      this.companyMessage='';
      this.companyResults=[];
      this.selectedCompany=null;
      this.showCompanyHouse=false;
    },
    async reviewCurrentPrompt(){
      if(!this.prompt.trim()){
        this.voiceStatus='Enter or record a prompt first.';
        return;
      }
      this.reviewingPrompt=true;
      try{
        const r=await fetch('/api/prompt/review',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf},
          body:JSON.stringify({prompt:this.prompt})
        });
        if(!r.ok) throw new Error('Review failed');
        this.promptReview=await r.json();
        this.approvedBlueprint=null;
        this.approvedGenerationMatrix=null;
        this.approvedImagePlan=[];
      this.seedQuestionAnswers();
        if(this.promptReview.businessName){
          this.businessName=this.promptReview.businessName;
          if((!this.domainTouched||!this.domain)&&this.promptReview.domainSuggestion){
            this.domain=this.promptReview.domainSuggestion;
            this.domainTitle='Domain suggested';
            this.domainMessage=`Suggested from reviewed prompt: ${this.domain}`;
          }
        }
      }catch{
        this.voiceStatus='Prompt review failed. You can still edit the prompt manually.';
      }finally{
        this.reviewingPrompt=false;
      }
    },
    approvePrompt(type){
      if(!this.promptReview)return;
      this.prompt=type==='enhanced'?this.promptReview.enhancedPrompt:this.promptReview.correctedPrompt;
      this.updateBusinessFromPrompt(true);
      if(this.promptReview.domainSuggestion && (!this.domainTouched||!this.domain)){
        this.domain=this.promptReview.domainSuggestion;
        this.domainTitle='Domain suggested';
        this.domainMessage=`Suggested from approved prompt: ${this.domain}`;
      }
    },
    approveBlueprint(){
      if(!this.promptReview?.blueprint)return;
      this.approvedBlueprint=this.promptReview.blueprint;
      this.approvedGenerationMatrix=this.promptReview.generationMatrix||null;
      this.approvedImagePlan=this.promptReview.imagePlan||[];
      if(this.promptReview.enhancedPrompt) this.prompt=this.promptReview.enhancedPrompt;
      if(this.promptReview.businessName) this.businessName=this.promptReview.businessName;
      if(this.promptReview.domainSuggestion && (!this.domainTouched||!this.domain)){
        this.domain=this.promptReview.domainSuggestion;
        this.domainTitle='Domain suggested';
        this.domainMessage=`Suggested from approved blueprint: ${this.domain}`;
      }
      this.updateBusinessFromPrompt(false);
    },
    seedQuestionAnswers(){
      const next={...this.questionAnswers};
      for(const question of this.promptReview?.questions||[]){
        if(!(question.id in next)) next[question.id]='';
      }
      this.questionAnswers=next;
    },
    answerPayload(){
      return (this.promptReview?.questions||[])
        .map(question=>({
          id:question.id,
          label:question.label,
          question:question.question,
          value:this.questionAnswers[question.id]||''
        }))
        .filter(answer=>String(answer.value||'').trim());
    },
    updateBusinessFromPrompt(forceDomain){
      const extracted=extractBusinessName(this.prompt);
      this.businessName=extracted;
      if(!extracted)return;
      const suggested=`${domainSlug(extracted)}.co.uk`;
      if(forceDomain||!this.domainTouched||!this.domain){
        if(this.domain!==suggested){
          this.domain=suggested;
          this.domainState='idle';
          this.domainTitle='Domain suggested';
          this.domainMessage=`Suggested from business name: ${suggested}`;
          this.domainSuggestions=[];
        }
      }
    },
    handleDomainInput(){
      this.domainTouched=true;
      this.autoCheckDomain();
    },
    async autoCheckDomain(){
      if(this.domain && this.domain.includes('.') && this.domain.length > 5) await this.checkDomain();
    },
    async checkDomain(){
      if(!this.domain){
        this.domainState='invalid';
        this.domainTitle='Add a domain';
        this.domainMessage='Enter a domain such as northlinedental.co.uk.';
        this.domainSuggestions=[];
        return;
      }
      this.checkingDomain=true;
      this.domainState='checking';
      this.domainTitle='Checking domain';
      this.domainMessage='Looking for DNS records and preparing connection options...';
      try{
        const r=await fetch(`/api/domain/check?domain=${encodeURIComponent(this.domain)}`);
        const data=await r.json();
        this.domain=data.domain||this.domain;
        this.domainState=data.status||'unknown';
        this.domainTitle=domainTitle(data.status,data.available);
        this.domainMessage=data.message;
        this.domainSuggestions=data.suggestions||[];
      }catch{
        this.domainState='unknown';
        this.domainTitle='Check unavailable';
        this.domainMessage='The live check failed, but the generated site can still be packaged ready to attach to this domain.';
      }finally{
        this.checkingDomain=false;
      }
    },
    selectDomain(domain){
      this.domainTouched=true;
      this.domain=domain;
      this.checkDomain();
    },
    async searchCompanyHouse(){
      const query=(this.companySearch||this.businessName||'').trim();
      if(query.length<2){
        this.companyMessage='Enter a company name or number first.';
        this.companyResults=[];
        return;
      }
      this.checkingCompany=true;
      this.companyMessage='Searching Companies House...';
      try{
        const r=await fetch(`/api/company-house/search?q=${encodeURIComponent(query)}`);
        const data=await r.json();
        this.companyResults=data.items||[];
        this.companyMessage=data.message||'Search complete.';
      }catch{
        this.companyMessage='Companies House search failed. You can continue without official company data.';
        this.companyResults=[];
      }finally{
        this.checkingCompany=false;
      }
    },
    selectCompany(company){
      this.selectedCompany=company;
      this.showCompanyHouse=true;
      if(company.companyName){
        this.businessName=company.companyName;
        this.prompt=injectOfficialBusinessName(this.prompt, company.companyName);
      }
      if(company.domainSuggestion && (!this.domainTouched||!this.domain)){
        this.domain=company.domainSuggestion;
        this.domainTitle='Domain suggested from Companies House';
        this.domainMessage=`Suggested from official company name: ${this.domain}`;
      }
      if(company.address){
        this.mustHave=[this.mustHave,`Registered office address from Companies House: ${company.address}.`].filter(Boolean).join('\n');
      }
    },
    addBriefPrompt(question){
      const additions={
        'Who is the site trying to win over?':'Target visitors are discerning local customers who want reassurance, quality, and a smooth booking experience.',
        'What should make this business feel different?':'Emphasise specialist expertise, personal service, transparent process, and thoughtful local credibility.',
        'What proof should be highlighted?':'Highlight experience, reviews, outcomes, accreditations, process, and realistic client stories.',
        'What action should visitors take first?':'Primary conversion is enquiry or booking, with phone and contact routes always easy to find.'
      };
      this.mustHave=[this.mustHave,additions[question]].filter(Boolean).join('\n');
    },
    async handleLogo(event){
      const file=event.target.files?.[0];
      if(!file)return;
      this.logoName=file.name;
      if(file.type==='image/svg+xml'){
        this.palette={primary:'#111111',secondary:'#f5f5f5',accent:'#555555'};
        return;
      }
      const bitmap=await createImageBitmap(file);
      const canvas=document.createElement('canvas');
      const size=80;
      canvas.width=size;
      canvas.height=size;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0,size,size);
      const data=ctx.getImageData(0,0,size,size).data;
      const buckets=new Map();
      for(let i=0;i<data.length;i+=16){
        const a=data[i+3];
        if(a<180)continue;
        const r=data[i],g=data[i+1],b=data[i+2];
        if(r>245&&g>245&&b>245)continue;
        const key=[Math.round(r/32)*32,Math.round(g/32)*32,Math.round(b/32)*32].join(',');
        buckets.set(key,(buckets.get(key)||0)+1);
      }
      const sorted=[...buckets.entries()].sort((a,b)=>b[1]-a[1]).map(([key])=>key.split(',').map(Number));
      const primary=sorted[0]||[17,17,17];
      const accent=sorted.find(c=>colourDistance(c,primary)>90)||[85,85,85];
      this.palette={primary:hex(primary),secondary:soften(primary),accent:hex(accent)};
    }
  }
}
function domainTitle(status,available){
  if(status==='available')return 'Available for demo';
  if(status==='registered')return 'Already registered';
  if(status==='invalid')return 'Invalid domain';
  if(available)return 'Likely available';
  return 'Domain checked';
}
function extractBusinessName(prompt){
  const text=String(prompt||'').replace(/\s+/g,' ').trim();
  const patterns=[
    /\bcalled\s+([A-Z0-9][A-Za-z0-9&' -]{1,70})(?=,|\.|\s+(?:with|in|for|that|which|and)\b|$)/i,
    /\bnamed\s+([A-Z0-9][A-Za-z0-9&' -]{1,70})(?=,|\.|\s+(?:with|in|for|that|which|and)\b|$)/i,
    /\bfor\s+([A-Z0-9][A-Za-z0-9&' -]{1,70})(?=,|\.|\s+(?:with|in|based|located|that|which)\b|$)/i
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(match?.[1]) return cleanBusinessName(match[1]);
  }
  return '';
}
function cleanBusinessName(value){
  return String(value)
    .replace(/\b(?:website|site|business|company|clinic|restaurant|law firm|gym)\b$/i,'')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/[.,;:!?]+$/,'');
}
function domainSlug(name){
  const words=String(name).toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9\s-]/g,'')
    .split(/\s+/)
    .filter(Boolean)
    .filter(word=>!['the','and','ltd','limited','llp','plc','uk'].includes(word));
  return (words.join('')||'brand').slice(0,48);
}
function appendSentence(current, addition){
  const spoken=String(addition||'').trim();
  if(!spoken)return String(current||'').trim();
  const base=String(current||'').trim();
  if(!base)return spoken;
  if(base.toLowerCase().includes(spoken.toLowerCase()))return base;
  return `${base} ${spoken}`.replace(/\s+/g,' ').trim();
}
function mergeVoicePrompt(current, addition){
  const base=String(current||'').trim();
  const spoken=String(addition||'').trim();
  if(!base)return spoken;
  if(base.toLowerCase().includes(spoken.toLowerCase()))return base;
  return `${base.replace(/[. ]*$/,'')}. ${spoken}`;
}
function injectOfficialBusinessName(prompt, name){
  const text=String(prompt||'').trim();
  if(!text)return `Build a website for ${name}.`;
  if(text.toLowerCase().includes(String(name).toLowerCase()))return text;
  return `${text}\nOfficial Companies House name: ${name}.`;
}
function hex(rgb){return '#'+rgb.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('')}
function soften(rgb){return hex(rgb.map(v=>Math.round(v+(255-v)*.88)))}
function colourDistance(a,b){return Math.sqrt(a.reduce((sum,v,i)=>sum+Math.pow(v-b[i],2),0))}
