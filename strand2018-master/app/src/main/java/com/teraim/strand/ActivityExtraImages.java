package com.teraim.strand;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.support.v4.content.FileProvider;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.text.Html;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.teraim.strand.dataobjekt.Table;
import com.teraim.strand.utils.Constants;
import com.teraim.strand.utils.ImageHandler;

import java.io.File;

public class ActivityExtraImages extends Activity {

    ImageHandler imageHandler;
    LinearLayout linearLayout;
    String extraPictureFileName;
    Provyta py;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_extra_images);

        py = Strand.getCurrentProvyta(this);
        linearLayout = findViewById(R.id.extraImagesList);
        imageHandler = new ImageHandler(this);
        Button b = findViewById(R.id.addExtraPhotoButton);


        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                extraPictureFileName = imageHandler.takeExtraPicture();
                //((ActivityExtraImages)c).extraPictureFileName =
            }
        });
    }

    @Override
    protected void onResume() {
        extraPictures(linearLayout);
        super.onResume();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == ImageHandler.TAKE_PICTURE){
            if (resultCode == Activity.RESULT_OK) {
                Log.d("Strand", "Picture " + extraPictureFileName + " was taken");

                Table extraImagesTable = py.getExtraImages();
                extraImagesTable.saveRow(extraPictureFileName, extraPictureFileName, "", "");

            } else {
                Log.d("Strand","picture was NOT taken, result NOT ok");
            }

        }
    }

    private void addImageTextToView(LinearLayout layout, final String extraPictureFileName, final String label, final String value, final int extraImageTableColumnIndex, boolean enableEdit) {
        final TextView textView = new TextView(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        //lp.gravity = Gravity.CENTER;
        lp.setMargins(10, 10, 10, 10);
        textView.setLayoutParams(lp);

        String displayValue = value.isEmpty() ? "(inte satt)" : value;

        textView.setText(Html.fromHtml("<b>"+label + ":</b> " + displayValue, Html.FROM_HTML_MODE_COMPACT));
        textView.setTextSize(20);

        if (enableEdit) {
            textView.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showTextEditDialog(extraPictureFileName, label, value, extraImageTableColumnIndex);
                }
            });
        }

        layout.addView(textView);
    }

    private void showTextEditDialog(final String extraPictureFileName, String label, String value, final int extraImageTableColumnIndex) {
        AlertDialog.Builder alert = new AlertDialog.Builder(this);
        alert.setTitle(label);

        final EditText inputView =(EditText) LayoutInflater.from(this).inflate(R.layout.extra_image_edittext, null);
        inputView.setHint("Skriv din " + label + " här");
        inputView.setText(value);

        alert.setPositiveButton("Spara", new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int whichButton) {
                //py.setBlålapp(inputView.getText().toString());
                Table extraImagesTable = py.getExtraImages();
                String[] row = extraImagesTable.getRow(extraPictureFileName);
                row[extraImageTableColumnIndex] = inputView.getText().toString();
                extraImagesTable.saveRow(extraPictureFileName, row);

                extraPictures(linearLayout);
            }
        });

        alert.setNegativeButton("Avbryt", new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int whichButton) {
                // Canceled.
            }
        });

        Dialog d = alert.setView(inputView).create();

        d.show();
    }



    private void extraPictures(LinearLayout layout){
        Provyta provyta = Strand.getCurrentProvyta(this.getBaseContext());
        Table extraImagesTable = provyta.getExtraImages();

        String name = provyta.getpyID()+"_Extra";
        layout.removeAllViews();
        File dir = new File(Constants.LOCAL_PICS_DIR);
        File[] files = dir.listFiles();
        for (final File file : files) {
            if (file.getName().startsWith(name) && file.getName().length()>5 ){

                String[] extraImageRow = extraImagesTable.getRow(file.getName());

                final ImageView image = new ImageView(this);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lp.gravity = Gravity.CENTER;
                lp.setMargins(10, 10, 10, 10);
                image.setLayoutParams(lp);
                imageHandler.addImageToImageView(image,file.getPath());
                layout.addView(image);

                if (extraImageRow != null && extraImageRow.length == 3) {
                    addImageTextToView(layout, extraImageRow[0], "Namn", extraImageRow[0], 0, false);
                    addImageTextToView(layout, extraImageRow[0], "Kommentar", extraImageRow[1], 1, true);
                    addImageTextToView(layout, extraImageRow[0],"Tag", extraImageRow[2], 2, true);
                }

                image.setOnLongClickListener(new View.OnLongClickListener() {
                    @Override
                    public boolean onLongClick(View v) {
                        new AlertDialog.Builder(ActivityExtraImages.this)
                                .setTitle("Ta bort bild")
                                .setPositiveButton("Ta bort", new DialogInterface.OnClickListener() {
                                    @Override
                                    public void onClick(DialogInterface dialog, int which) {
                                        file.delete();

                                        Table extraImagesTable = py.getExtraImages();
                                        extraImagesTable.deleteRow(file.getName());

                                        extraPictures(linearLayout);
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
                        Uri data = FileProvider.getUriForFile(ActivityExtraImages.this, getApplicationContext().getPackageName() + ".provider", file);
                        intent.setDataAndType(data, "image/*");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(intent);
                    }
                });
            }
        }

    }
}