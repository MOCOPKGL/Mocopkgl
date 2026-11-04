const { randomUUID } = require("crypto");

const STORE_NAME = "pkgl-join-interest";

function clean(value,max=120){
  return String(value||"").trim().slice(0,max);
}

async function getInterestStore(){
  const { getStore } = await import("@netlify/blobs");
  return getStore(STORE_NAME);
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

    for(const key of [
      "first_name",
      "last_name",
      "approximate_handicap",
      "kid_name",
      "kid_age",
      "city_of_residence",
      "email",
      "phone"
    ]){
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

    const store=await getInterestStore();

    const key=
      record.submitted_at.replace(/[:.]/g,"-")
      +"-"
      +randomUUID()
      +".json";

    await store.set(
      key,
      JSON.stringify(record),
      {
        onlyIfNew:true,
        metadata:{
          submitted_at:record.submitted_at
        }
      }
    );

    return {
      statusCode:200,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({success:true})
    };
  }catch(error){
    console.error("join-interest-submit",error);

    return {
      statusCode:500,
      headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store, max-age=0"
      },
      body:JSON.stringify({
        error:"We could not save your information. Please try again."
      })
    };
  }
};
