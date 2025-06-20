const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

function sendEmail(dest, sub, text, attach = false){
    let transport = nodemailer.createTransport({
        service: 'gmail',

        auth: {
            user: process.env.EMAIL,
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
                    filename: "Logo.svg",
                    path: "../assets/Logo.svg",
                    cid: "logo@example.com"
                }
            ]
        };
    }
    

    transport.sendMail(mailOpt, (error, info) => {
        if(error){
            console.log(error);
        }else{
            console.log('Email sent: ' + info.response);
        }
    });
}

module.exports={
    sendEmail
}