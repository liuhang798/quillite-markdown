import { translationPlan } from './reading-translation-plan.js';
self.onmessage = ({data}) => {
  try { self.postMessage({sections:translationPlan(data)}); }
  catch { self.postMessage({error:true}); }
};
