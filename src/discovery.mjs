import {getJson,assertSafeJupiterUrl} from './http.mjs';
export function inspectSpec(json){
  const paths=json?.paths;if(!paths||typeof paths!=='object')throw new Error('OPENAPI_PATHS_MISSING');
  const found=[];
  for(const [path,methods] of Object.entries(paths)) {
    if(!path.startsWith('/api/v1/play/')&&!path.startsWith('/play/'))continue;
    for(const [method,meta] of Object.entries(methods||{})){
      if(!['get','head'].includes(method.toLowerCase()))continue;
      found.push({path,method:method.toUpperCase(),summary:meta?.summary||'',operationId:meta?.operationId||''});
    }
  }
  return found;
}
export async function discover(cfg,store,transport=fetch){
  assertSafeJupiterUrl(cfg.openapiUrl);
  const schema=await getJson(cfg.openapiUrl,10000,transport);
  const paths=inspectSpec(schema);
  const sourcePath=new URL(cfg.roundsUrl).pathname;
  const roundsInSchema=paths.some(x=>x.path===sourcePath && x.method==='GET');
  const audit={capturedAt:new Date().toISOString(),source:cfg.openapiUrl,openApiVersion:schema.openapi||schema.swagger||'unknown',
    readOnlyPlayPaths:paths,roundsPath:sourcePath,roundsInSchema};
  store.saveEvidence('arcade.openapi.audit',audit);
  store.saveEvidence('arcade.openapi.full',schema);
  return audit;
}
