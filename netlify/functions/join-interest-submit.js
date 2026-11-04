const { randomUUID } = require("crypto");

const BUCKET = "PKGL Join Interest";

async function ensurePrivateBucket(SUPABASE_URL,SERVICE_KEY) {
  const headers = {
    apikey:SERVICE_KEY,
    Authorization:`Bearer ${SERVICE_KEY}`,
    "Content-Type":"application/json"
  };

  const check = await fetch(
    `${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,
    { headers }
  );

  if (check.ok) return;

  if (check.status !== 404) {
    throw new Error(await check.text() || "Unable to check interest-list storage.");
  }

  const create = await fetch(
    `${SUPABASE_URL}/storage/v1/bucket`,
    {
      method:"POST",
      headers,
      body:JSON.stringify({
        id:BUCKET,
        name:BUCKET,
        public:false
      })
    }
  );

  if (!create.ok) {
    const text = await create.text();
    if (!/already exists/i.test(text)) {
      throw new Error(text || "Unable to create private interest-list storage.");
    }
  }
}

function clean(value,max=120){
  return String(value||"").trim().slice(0,max);
}

exports.handler = async function(event){
  try{
    if(event.httpMethod!=="POST"){
      return {statusCode:405,body:JSON.stringify({error:"Method not allowed"})};
    }

    const SUPABASE_URL=process.env.SUPABASE_URL;
    const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!SUPABASE_URL||!SERVICE_KEY){
      throw new Error("Server configuration is missing.");
    }

    const body=JSON.parse(event.body||"{}");

    if(clean(body.bot_field,50)){
      return {statusCode:200,body:JSON.stringify({success:true})};
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
        return {statusCode:400,body:JSON.stringify({error:"Please complete all fields."})};
      }
    }

    const age=Number(record.kid_age);
    if(!Number.isFinite(age)||age<4||age>18){
      return {statusCode:400,body:JSON.stringify({error:"Please enter a valid kid age."})};
    }

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)){
      return {statusCode:400,body:JSON.stringify({error:"Please enter a valid email address."})};
    }

    await ensurePrivateBucket(SUPABASE_URL,SERVICE_KEY);

    const fileName=
      record.submitted_at.replace(/[:.]/g,"-")
      +"-"
      +randomUUID()
      +".json";

    const upload=await fetch(
      `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeURIComponent(fileName)}`,
      {
        method:"POST",
        headers:{
          apikey:SERVICE_KEY,
          Authorization:`Bearer ${SERVICE_KEY}`,
          "Content-Type":"application/json",
          "x-upsert":"false"
        },
        body:JSON.stringify(record)
      }
    );

    if(!upload.ok){
      throw new Error(await upload.text()||"Unable to save the interest form.");
    }

    return {
      statusCode:200,
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({success:true})
    };
  }catch(error){
    return {
      statusCode:500,
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({error:error.message||"Unable to submit the form."})
    };
  }
};
