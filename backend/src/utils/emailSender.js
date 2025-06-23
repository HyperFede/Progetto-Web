const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

function sendEmail(dest, sub, text, attach = false){
    let transport = nodemailer.createTransport({
        service: 'gmail',

        auth: {
            user: "bazartcommerce@gmail.com",
            pass:"nksl xati rsre rgbq",
        }
    });

    let mailOpt;

    if(!attach){
        mailOpt = {
            from: 'bazartcommerce@gmail.com',
            to: dest,
            subject: sub,
            html: text
        };
    }else{
        mailOpt = {
            from: 'bazartcommerce@gmail.com',
            to: dest,
            subject: sub,
            html: text,
            attachments: [
                {
                    filename: "logo.png",
                    path: "logo.png",
                    cid: "logo@bazart"
                }
            ]
        };
    }
    

    transport.sendMail(mailOpt, (error, info) => {
        if(error){
            console.log(error);
        }else{
            console.log('Email sent: ' + info.response);
            console.log(text);
        }
    });
}

module.exports={
    sendEmail
}