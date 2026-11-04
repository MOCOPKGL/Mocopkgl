function clean(value,max=120){
  return String(value||"").trim().slice(0,max);
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

    const row={
      first_name:clean(body.first_name,80),
      last_name:clean(body.last_name,80),
      approximate_handicap:clean(body.approximate_handicap,30),
      kid_name:clean(body.kid_name,80),
      kid_age:Number(clean(body.kid_age,10)),
      city_of_residence:clean(body.city_of_residence,100),
      email:clean(body.email,160),
      phone:clean(body.phone,60)
    };

    for(const key of [
      "first_name",
      "last_name",
      "approximate_handicap",
      "kid_name",
      "city_of_residence",
      "email",
      "phone"
    ]){
      if(!row[key]){
        return {
          statusCode:400,
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({error:"Please complete all fields."})
        };
      }
    }

    if(!Number.isFinite(row.kid_age)||row.kid_age<4||row.kid_age>18){
      return {
        statusCode:400,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Please enter a valid kid age."})
      };
    }

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)){
      return {
        statusCode:400,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({error:"Please enter a valid email address."})
      };
    }

    const response=await fetch(
      `${SUPABASE_URL}/rest/v1/pkgl_join_interest`,
      {
        method:"POST",
        headers:{
          apikey:SERVICE_KEY,
          Authorization:`Bearer ${SERVICE_KEY}`,
          "Content-Type":"application/json",
          Prefer:"return=minimal"
        },
        body:JSON.stringify(row)
      }
    );

    const text=await response.text();

    if(!response.ok){
      console.error("join-interest insert failed",response.status,text);
      throw new Error("Unable to save interest form.");
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
