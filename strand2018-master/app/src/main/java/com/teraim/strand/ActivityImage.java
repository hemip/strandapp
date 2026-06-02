package com.teraim.strand;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.support.v4.content.FileProvider;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.teraim.strand.utils.Constants;
import com.teraim.strand.utils.ImageHandler;

import java.io.File;
//For viewing and taking photos for "deponi" items.

public class ActivityImage extends Activity {

    String header, type;
    TextView headerTextView;
    ImageHandler imageHandler;
    LinearLayout linearLayout;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_image_viewer);

        Intent i = getIntent();
        header = i.getStringExtra("HEADER");
        type = i.getStringExtra("TYPE");
        headerTextView = findViewById(R.id.imageHeader);
        headerTextView.setText(header);
        linearLayout = findViewById(R.id.imageList);
        imageHandler = new ImageHandler(this);
        Button b = findViewById(R.id.photoButton);
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                imageHandler.takeDeponiPicture(type);
            }
        });
    }
    @Override
    protected void onResume() {
        deponiPictures(type,linearLayout);

        super.onResume();

    }

    private void deponiPictures(String deponityp, LinearLayout layout){
        String name = Strand.getCurrentProvyta(this.getBaseContext()).getpyID()+"_Deponi_"+deponityp;
        layout.removeAllViews();
        File dir = new File(Constants.LOCAL_PICS_DIR);
        File[] files = dir.listFiles();
        for (final File file : files) {
            if (file.getName().startsWith(name) && file.getName().length()>5 ){
                final ImageView image = new ImageView(this);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.gravity = Gravity.CENTER;
                lp.setMargins(10, 10, 10, 10);
                image.setLayoutParams(lp);
                imageHandler.addImageToImageView(image,file.getPath());
                layout.addView(image);

                image.setOnLongClickListener(new View.OnLongClickListener() {
                    @Override
                    public boolean onLongClick(View v) {
                        new AlertDialog.Builder(ActivityImage.this)
                                .setTitle("Ta bort bild")
                                .setPositiveButton("Ta bort", new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface dialog, int which) {
                                        file.delete();
                                        deponiPictures(type,linearLayout);
                                        dialog.dismiss();
                                    }
                                })
                                .setNegativeButton("Avbryt", new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface dialog, int which) {
                                        dialog.dismiss();
                                    }
                                }).show();
                        return true;
                    }
                });
                image.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        Intent intent = new Intent(android.content.Intent.ACTION_VIEW);
                        Uri data = FileProvider.getUriForFile(ActivityImage.this, getApplicationContext().getPackageName() + ".provider", file);
                        intent.setDataAndType(data, "image/*");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(intent);
                    }
                });
            }
        }

    }
}
