const { randomUUID } = require("crypto");

const BUCKET = "pkgl-join-interest";

function clean(value,max=120){
  return String(value||"").trim().slice(0,max);
}

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

function storageMessage(text,fallback){
  if(!text)return fallback;
  try{
    const parsed=JSON.parse(text);
    return parsed.message||parsed.error||fallback;
  }catch{
    return fallback;
  }
}

function storageHeaders(SERVICE_KEY,includeJson=true){
  return {
    apikey:SERVICE_KEY,
    Authorization:`Bearer ${SERVICE_KEY}`,
    ...(includeJson?{"Content-Type":"application/json"}:{})
  };
}

async function bucketExists(SUPABASE_URL,SERVICE_KEY){
  const res=await fetch(
    `${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,
    {headers:storageHeaders(SERVICE_KEY)}
  );

  if(res.ok)return true;
  if(res.status===404)return false;

  const text=await res.text();
  throw new Error(storageMessage(text,"Unable to check interest-list storage."));
}

async function ensurePrivateBucket(SUPABASE_URL,SERVICE_KEY){
  if(await bucketExists(SUPABASE_URL,SERVICE_KEY))return;

  const create=await fetch(
    `${SUPABASE_URL}/storage/v1/bucket`,
    {
      method:"POST",
      headers:storageHeaders(SERVICE_KEY),
      body:JSON.stringify({
        id:BUCKET,
        name:BUCKET,
        public:false
      })
    }
  );

  if(!create.ok){
    const text=await create.text();
    if(!/already exists|duplicate/i.test(text)){
      throw new Error(storageMessage(text,"Unable to create interest-list storage."));
    }
  }

  for(let attempt=0;attempt<5;attempt++){
    if(await bucketExists(SUPABASE_URL,SERVICE_KEY))return;
    await wait(150*(attempt+1));
  }

  throw new Error("Interest-list storage is not ready yet. Please try again.");
}

async function uploadRecord(SUPABASE_URL,SERVICE_KEY,fileName,record){
  return fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(fileName)}`,
    {
      method:"POST",
      headers:{
        ...storageHeaders(SERVICE_KEY,false),
        "Content-Type":"application/json",
        "x-upsert":"false"
      },
      body:JSON.stringify(record)
    }
  );
}

exports.handler = async function(event){
  try{
    if(event.httpMethod!=="POST"){
      return {
        statusCode:405,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Method not allowed"})
      };
    }

    const SUPABASE_URL=process.env.SUPABASE_URL;
    const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!SUPABASE_URL||!SERVICE_KEY){
      throw new Error("Server configuration is missing.");
    }

    const body=JSON.parse(event.body||"{}");

    if(clean(body.bot_field,50)){
      return {
        statusCode:200,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({success:true})
      };
    }

    const record={
      first_name:clean(body.first_name,80),
      last_name:clean(body.last_name,80),
      approximate_handicap:clean(body.approximate_handicap,30),
      kid_name:clean(body.kid_name,80),
      kid_age:clean(body.kid_age,10),
      city_of_residence:clean(body.city_of_residence,100),
      email:clean(body.email,160),
      phone:clean(body.phone,60),
      submitted_at:new Date().toISOString()
    };

    for(const key of ["first_name","last_name","approximate_handicap","kid_name","kid_age","city_of_residence","email","phone"]){
      if(!record[key]){
        return {
          statusCode:400,
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({error:"Please complete all fields."})
        };
      }
    }

    const age=Number(record.kid_age);
    if(!Number.isFinite(age)||age<4||age>18){
      return {
        statusCode:400,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Please enter a valid kid age."})
      };
    }

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)){
      return {
        statusCode:400,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Please enter a valid email address."})
      };
    }

    await ensurePrivateBucket(SUPABASE_URL,SERVICE_KEY);

    const fileName=
      record.submitted_at.replace(/[:.]/g,"-")
      +"-"
      +randomUUID()
      +".json";

    let upload=await uploadRecord(
      SUPABASE_URL,
      SERVICE_KEY,
      fileName,
      record
    );

    if(!upload.ok){
      const firstError=await upload.text();

      if(
        upload.status===404
        ||
        /bucket.*not found|NoSuchBucket/i.test(firstError)
      ){
        await ensurePrivateBucket(SUPABASE_URL,SERVICE_KEY);
        await wait(250);

        upload=await uploadRecord(
          SUPABASE_URL,
          SERVICE_KEY,
          fileName,
          record
        );
      }else{
        throw new Error(storageMessage(firstError,"Unable to save the interest form."));
      }
    }

    if(!upload.ok){
      const text=await upload.text();
      throw new Error(storageMessage(text,"Unable to save the interest form."));
    }

    return {
      statusCode:200,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({success:true})
    };
  }catch(error){
    return {
      statusCode:500,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({
        error:error.message||"Unable to submit the form."
      })
    };
  }
};
