const nodemailer = require('nodemailer');

export default function sendEmail(dest, sub, text){
    let transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'bazartcommerce@gmail.com',
            pass: 'BazArtTiaStefFede06%'
        }
    });
    
    let mailOpt = {
        from: 'bazartcommerce@gmail.com',
        to: dest,
        subject: sub,
        html: text
    };

    transport.sendMail(mailOpt, (error, info) => {
        if(error){
            console.log(error);
        }else{
            console.log('Email sent: ' + info.response);
        }
    });
}